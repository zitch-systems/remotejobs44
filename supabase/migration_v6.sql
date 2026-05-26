-- ============================================================
-- RemoteJobs44 — Migration v6
-- Run AFTER migration_v5.sql in: Supabase Dashboard → SQL Editor.
--
-- Adds idempotency key for Paystack charge events.
-- A single Paystack `reference` should only ever credit a user once,
-- regardless of how many times verify is called or the webhook retries.
-- The unique constraint forces the second insert to error, which the
-- application code can catch and ignore.
-- ============================================================

alter table public.subscriptions
  add column if not exists paystack_reference text;

-- Unique constraint over non-null references. Same partial-index pattern
-- the apply_url column used to use.
create unique index if not exists subscriptions_paystack_reference_idx
  on public.subscriptions(paystack_reference)
  where paystack_reference is not null;
