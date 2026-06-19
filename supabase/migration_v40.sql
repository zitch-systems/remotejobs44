-- ============================================================
-- RemoteJobs44 — Migration v40
-- Run AFTER migration_v39.sql in: Supabase Dashboard → SQL Editor.
--
-- Consumed-reference ledger so the paystack-verify edge function is idempotent:
-- a successful Paystack reference can be redeemed exactly once. Without this a
-- signed-in user could re-call paystack-verify with the same reference to keep
-- extending their plan for free (replay / double-grant).
--
-- The edge function (service role) is the only writer; no public policies, so
-- anon/authenticated can neither read nor write it.
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.paystack_transactions (
  reference  text primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  plan       text,
  selection  text,
  amount     integer,
  currency   text,
  created_at timestamptz not null default now()
);

alter table public.paystack_transactions enable row level security;
