-- ============================================================
-- RemoteJobs44 — Migration v33
-- Run AFTER migration_v32.sql in: Supabase Dashboard → SQL Editor.
--
-- Adds the AGENT role + referral / commission program.
--
-- An "agent" is a normal user (registers + logs in the same way, still
-- needs a subscription for the job-seeker features) whose role is flipped
-- to 'agent' by an admin. Agents promote the platform through a personal
-- referral link and earn an admin-set percentage of every subscription
-- their referrals pay for. This migration adds:
--
--   * profiles.role gains 'agent' (CHECK widened).
--   * profiles.referral_code   — the agent's unique link slug (/r/<code>).
--   * profiles.referred_by      — which agent (if any) referred this user.
--   * profiles.commission_rate  — the agent's % cut (0–100), set per-agent
--                                 by an admin. Defaults to 0 (no payout
--                                 until an admin sets it).
--   * referral_clicks    — one row per click on a referral link.
--   * agent_commissions  — one row per referred subscription charge, with
--                          the computed commission at the rate in force.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Widen the role CHECK to allow 'agent' ───────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user','admin','agent'));

-- ── 2. Referral columns on profiles ────────────────────────
-- commission_rate is NOT NULL DEFAULT 0 so a freshly-promoted agent earns
-- nothing until an admin explicitly sets their rate (the chosen default).
alter table public.profiles
  add column if not exists referral_code   text,
  add column if not exists referred_by     uuid references public.profiles(id) on delete set null,
  add column if not exists commission_rate numeric(5,2) not null default 0;

-- Unique per non-null code (a partial unique index keeps the many NULLs of
-- non-agent rows legal while guaranteeing distinct codes among agents).
create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code) where referral_code is not null;

-- Powers the agent's "how many people registered" count + the attribution
-- look-ups when a referred user pays.
create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by) where referred_by is not null;

-- ── 3. Referral click log ──────────────────────────────────
-- Written by /r/<code> (service-role). ip_hash is a salted SHA-256 of the
-- visitor IP — kept for coarse de-dup / abuse analysis without storing a
-- raw IP. referrer/path/user_agent are best-effort context.
create table if not exists public.referral_clicks (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  path          text,
  referrer      text,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists referral_clicks_agent_idx
  on public.referral_clicks (agent_id, created_at desc);

-- ── 4. Commission ledger ───────────────────────────────────
-- One row per referred subscription charge. paystack_reference is unique
-- (partial, non-null) so the verify route and the webhook — which both fire
-- for the same charge — can each attempt the insert and the loser is a
-- harmless 23505. status starts 'pending'; an admin/payout job can advance
-- it to approved/paid/reversed.
create table if not exists public.agent_commissions (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references public.profiles(id) on delete cascade,
  referred_user_id   uuid references public.profiles(id) on delete set null,
  plan               text not null,
  billing            text,
  amount             numeric(12,2) not null default 0,
  currency           text not null default 'NGN',
  commission_rate    numeric(5,2)  not null default 0,
  commission_amount  numeric(12,2) not null default 0,
  paystack_reference text,
  status             text not null default 'pending'
                     check (status in ('pending','approved','paid','reversed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists agent_commissions_reference_key
  on public.agent_commissions (paystack_reference) where paystack_reference is not null;
create index if not exists agent_commissions_agent_idx
  on public.agent_commissions (agent_id, created_at desc);

-- set_updated_at() is defined in schema.sql and already in prod.
drop trigger if exists agent_commissions_updated_at on public.agent_commissions;
create trigger agent_commissions_updated_at before update on public.agent_commissions
  for each row execute function public.set_updated_at();

-- ── 5. Row Level Security ───────────────────────────────────
-- Owners (the agent) + admins may READ. There are intentionally no
-- insert/update/delete policies: every write goes through a server route
-- using the service-role client (which bypasses RLS). No policy = deny for
-- anon/authenticated, so a user can never forge a click or a commission.
alter table public.referral_clicks   enable row level security;
alter table public.agent_commissions enable row level security;

drop policy if exists referral_clicks_select on public.referral_clicks;
create policy referral_clicks_select on public.referral_clicks for select
  using (
    agent_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists agent_commissions_select on public.agent_commissions;
create policy agent_commissions_select on public.agent_commissions for select
  using (
    agent_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );
