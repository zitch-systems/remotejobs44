-- ============================================================
-- RemoteJobs44 — Migration v20
-- Two race-condition holes + one CHECK-constraint hole closed.
-- ============================================================

begin;

-- 1) public.applications had no UNIQUE (user_id, job_id). The route
--    pre-checks for an existing row with maybeSingle() but two POSTs
--    racing in parallel (rapid double-click on Apply) can both pass
--    the check before either INSERTs — both succeed, the user has
--    two rows for the same job. Currently 0 duplicates exist, so
--    no cleanup step.
alter table public.applications
  add constraint applications_user_job_unique unique (user_id, job_id);

-- 2) public.paystack_webhook_events.paystack_id had no UNIQUE. The
--    webhook route relies on a 23505 unique_violation to detect a
--    duplicate event (retry from Paystack) and short-circuit. The
--    only UNIQUE on the table was the PK `id` — always a fresh UUID,
--    so 23505 has NEVER fired on a real paystack_id collision. Today
--    we have 0 events because webhooks aren't yet wired up in
--    Paystack Dashboard; once they are, a retried charge.success
--    would re-process and risk double-crediting a paying user.
alter table public.paystack_webhook_events
  add constraint paystack_webhook_events_paystack_id_unique unique (paystack_id);

-- 3) subscriptions_status_check rejected 'payment_failed'. The
--    invoice.payment_failed webhook tries to UPDATE
--      status = 'payment_failed', current_period_end = now()
--    as a single atomic statement. With the old CHECK list
--    ('active','cancelled','past_due','expired') the entire UPDATE
--    raised 23514 — status STAYED 'active', current_period_end
--    stayed its future date, and the expire-cron's
--    "current_period_end < proCutoff" filter never matched. Net
--    effect: a Pro user whose card declines keeps Pro forever.
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
