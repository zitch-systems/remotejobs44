-- ============================================================
-- RemoteJobs44 — Migration v4
-- Run AFTER migration_v3.sql in: Supabase Dashboard → SQL Editor.
-- Adds: user suspension, email preferences, admin audit log,
--       Paystack email_token persistence for self-service cancel.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. profiles: suspend flag ──────────────────────────────
-- Admin-set ban / temporary hold. Suspended users can still log in (they
-- need to see the "your account is suspended" notice) but the API layer
-- treats them as if logged-out for any state-changing action.
alter table public.profiles
  add column if not exists suspended boolean default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

create index if not exists profiles_suspended_idx
  on public.profiles(suspended) where suspended = true;

-- ── 2. profiles: email/notification preferences ────────────
-- jsonb so we can add more knobs (digest cadence, channel choice, …)
-- without further migrations. Each key is `true` = opted in.
alter table public.profiles
  add column if not exists email_prefs jsonb default jsonb_build_object(
    'marketing',       true,
    'job_alerts',      true,
    'billing',         true,
    'product_updates', true
  );

-- Backfill rows created before this migration so they have the full key
-- set (and clients can render checkboxes without null-handling everywhere).
update public.profiles
   set email_prefs = jsonb_build_object(
     'marketing',       true,
     'job_alerts',      true,
     'billing',         true,
     'product_updates', true
   )
 where email_prefs is null;

-- ── 3. admin_actions audit log ─────────────────────────────
-- Every admin-only mutation appends a row here. Keep it append-only —
-- there is no policy for update or delete. RLS allows admins to read all
-- rows and insert their own; everyone else is locked out entirely.
create table if not exists public.admin_actions (
  -- gen_random_uuid (pgcrypto) is enabled by default on Supabase; the rest
  -- of our migrations use it. v2/v3 mixed uuid_generate_v4 which needs the
  -- uuid-ossp extension — fresh Supabase projects don't always have it.
  id           uuid default gen_random_uuid() primary key,
  admin_id     uuid references public.profiles(id) on delete set null,
  admin_email  text,
  -- e.g. 'user.update_plan', 'user.delete', 'user.suspend',
  --      'user.reset_password', 'company.refresh', 'job.feature'.
  action       text not null,
  -- 'user' | 'company' | 'job' | 'subscription' …
  target_type  text,
  target_id    text,
  -- patch contents, before/after, scrape counts, etc.
  metadata     jsonb,
  created_at   timestamptz default now()
);

alter table public.admin_actions enable row level security;

drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

drop policy if exists admin_actions_insert on public.admin_actions;
create policy admin_actions_insert on public.admin_actions for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create index if not exists admin_actions_created_at_idx
  on public.admin_actions(created_at desc);
create index if not exists admin_actions_admin_id_idx
  on public.admin_actions(admin_id);
create index if not exists admin_actions_target_idx
  on public.admin_actions(target_type, target_id);

-- ── 4. subscriptions: paystack email_token ─────────────────
-- Needed for /subscription/disable. Paystack returns this when a
-- subscription is first created and won't expose it later without an
-- extra GET /subscription/:code roundtrip. We now save it from the
-- webhook + verify flow so user-initiated cancellation can disable
-- billing in one call instead of falling back to soft-cancel.
alter table public.subscriptions
  add column if not exists paystack_email_token text;
