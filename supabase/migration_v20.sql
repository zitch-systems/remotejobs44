-- ============================================================
-- RemoteJobs44 — Migration v20
-- Two race-condition holes + one CHECK-constraint hole closed.
--
-- Idempotent — re-running on a DB that already has any of these
-- constraints is a no-op. The constraints were originally applied
-- in-session via MCP (add_dedup_unique_constraints,
-- subscriptions_allow_payment_failed_status); this file mirrors
-- that for the repo-only path.
-- ============================================================

begin;

-- 1) applications: UNIQUE (user_id, job_id)
--
-- The route pre-checks for an existing row with maybeSingle() but
-- two POSTs racing in parallel (rapid double-click on Apply) can
-- both pass the check before either INSERTs — both succeed, the
-- user has two rows for the same job. Currently 0 duplicates exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.applications'::regclass
      and conname  = 'applications_user_job_unique'
  ) then
    alter table public.applications
      add constraint applications_user_job_unique unique (user_id, job_id);
  end if;
end$$;

-- 2) paystack_webhook_events: UNIQUE (paystack_id)
--
-- Webhook route relies on a 23505 unique_violation to detect a
-- Paystack retry of the same event and short-circuit. The only
-- UNIQUE on the table was the PK `id` (always a fresh UUID), so
-- 23505 has never fired on a real paystack_id collision. Critical
-- to fix BEFORE webhooks are wired up — a retried charge.success
-- would otherwise double-credit a paying user.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.paystack_webhook_events'::regclass
      and conname  = 'paystack_webhook_events_paystack_id_unique'
  ) then
    alter table public.paystack_webhook_events
      add constraint paystack_webhook_events_paystack_id_unique unique (paystack_id);
  end if;
end$$;

-- 3) subscriptions_status_check: allow 'payment_failed'
--
-- The invoice.payment_failed webhook tries to UPDATE
--   status = 'payment_failed', current_period_end = now()
-- as a single atomic statement. With the old CHECK list
-- ('active','cancelled','past_due','expired') the entire UPDATE
-- raised 23514 — status STAYED 'active', current_period_end stayed
-- its future date, and the expire-cron's
-- "current_period_end < proCutoff" filter never matched. Net: a
-- Pro user whose card declines keeps Pro forever.
--
-- Idempotent via DROP IF EXISTS + recreate — same CHECK shape, just
-- with the extra status value.
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status = any (array[
    'active'::text,
    'cancelled'::text,
    'past_due'::text,
    'expired'::text,
    'payment_failed'::text
  ]));

commit;
