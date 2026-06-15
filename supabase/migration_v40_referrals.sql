-- migration_v40_referrals.sql
-- Referral / invite loop. Each profile gets a shareable referral_code; the
-- referrals table records who each user brought in. Attribution (creating a
-- referrals row when a new user signs up via ?ref=CODE) is performed by the web
-- signup flow / backend with the service role — the mobile app only reads the
-- code to share and counts confirmed referrals (mobile lib/referrals.ts).

-- 1. A shareable code + who referred this user, on the profile.
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references auth.users(id) on delete set null;

-- Backfill existing rows with a short, unambiguous uppercase code.
update public.profiles
  set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where referral_code is null;

-- New rows get one by default; keep it unique.
alter table public.profiles
  alter column referral_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

-- 2. The referral ledger.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid references auth.users(id) on delete set null,
  status text not null default 'joined' check (status in ('pending', 'joined', 'rewarded')),
  created_at timestamptz not null default now(),
  unique (referrer_id, referred_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referrals enable row level security;

-- A user can read the referrals they generated (to show their invite count).
drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own" on public.referrals for select to authenticated
  using (auth.uid() = referrer_id);

-- Inserts / status updates (attribution + reward grants) run server-side with
-- the service role, so no insert/update policy is granted to end users here.
