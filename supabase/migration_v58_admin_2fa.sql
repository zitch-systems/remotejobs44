-- ============================================================
-- RemoteJobs44 — Migration v58
-- Run AFTER migration_v57.sql in: Supabase Dashboard → SQL Editor.
--
-- Email-based admin two-factor auth. After password login, an admin requests a
-- 6-digit code that is emailed to the admin mailbox (admin@remotejobs44.com);
-- entering it sets a short-lived signed session cookie that /api/admin routes
-- require (when NEXT_PUBLIC_ADMIN_MFA_REQUIRED=true). This table holds the
-- hashed, single-use, expiring codes.
--
-- Only the service-role server (the /api/admin/2fa endpoints) ever touches this
-- table — RLS is enabled with NO policies so anon/authenticated clients get
-- deny-all. Codes are stored hashed (sha256 of user_id:code), never plaintext.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.admin_2fa_codes (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists admin_2fa_codes_user_idx
  on public.admin_2fa_codes (user_id, created_at desc);

-- Deny-all to clients; the server uses the service role (bypasses RLS).
alter table public.admin_2fa_codes enable row level security;

revoke all on public.admin_2fa_codes from anon, authenticated;
