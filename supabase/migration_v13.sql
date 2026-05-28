-- ============================================================
-- RemoteJobs44 — Migration v13
-- Adds: paystack_webhook_events — generic webhook idempotency log so
-- replayed Paystack events (5xx retries, network glitches) don't get
-- processed twice. Each event-type + paystack-resource-id pair is
-- unique; a duplicate INSERT raises a constraint violation that the
-- handler catches as "already processed, short-circuit".
-- Idempotent — safe to re-run.
-- ============================================================
--
-- The previous per-event dedup keyed on `paystack_reference` only
-- protected charge.success. invoice.payment_failed,
-- subscription.disable, and any future events had no dedup at all —
-- a replayed payment-failed event would re-email the user every time.
--
-- We dedup by (event_type, paystack_id) where paystack_id is whichever
-- data.id / data.subscription.subscription_code / data.invoice_code
-- the event carries. The handler builds the value before insert; the
-- unique constraint guarantees we never process the same pair twice.

create table if not exists public.paystack_webhook_events (
  id           uuid default gen_random_uuid() primary key,
  event_type   text not null,
  -- Whatever Paystack identifier uniquely names the underlying
  -- resource. For charge.success, this is the transaction reference.
  -- For invoice.payment_failed, the invoice or subscription code.
  -- The handler picks the most specific value available.
  paystack_id  text not null,
  -- Snapshot of the event payload — useful for debugging "why didn't
  -- this user get their plan?" without going back to Paystack's
  -- dashboard. JSON-typed; the column is nullable so a future handler
  -- that wants to skip the payload can.
  payload      jsonb,
  received_at  timestamptz default now() not null,
  processed    boolean default true not null
);

create unique index if not exists paystack_webhook_events_dedup_idx
  on public.paystack_webhook_events(event_type, paystack_id);

create index if not exists paystack_webhook_events_received_at_idx
  on public.paystack_webhook_events(received_at desc);

alter table public.paystack_webhook_events enable row level security;

-- Only the service role inserts here (the webhook runs with admin
-- client). Admins can read for debugging. Nobody can update or delete.
drop policy if exists paystack_webhook_events_admin_select on public.paystack_webhook_events;
create policy paystack_webhook_events_admin_select
  on public.paystack_webhook_events for select
  using ( public.is_admin(auth.uid()) );
