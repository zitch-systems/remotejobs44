-- ============================================================
-- RemoteJobs44 — Migration v57
-- Run AFTER migration_v56.sql in: Supabase Dashboard → SQL Editor.
--
-- Fix webhook idempotency dedup key. migration_v13 already created the CORRECT
-- composite unique key `(event_type, paystack_id)` on paystack_webhook_events.
-- migration_v20 then ALSO added a standalone `unique (paystack_id)` whose
-- comment ("the only UNIQUE was the PK") was simply wrong — the composite
-- already existed.
--
-- The standalone constraint is not just redundant, it's harmful: Paystack's
-- numeric data.id (the fallback paystack_id, see lib/paystack/event-id.ts) is
-- NOT globally unique across event types, so two LEGITIMATELY DIFFERENT events
-- that happen to share an id collide. The webhook route treats any 23505 as
-- "already processed → 200, skip", so the second event (e.g. a
-- subscription.disable / invoice.payment_failed that should downgrade a
-- non-renewing user) is silently dropped → the user keeps Pro without paying.
--
-- Drop the standalone constraint; keep the composite from v13.
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table public.paystack_webhook_events
  drop constraint if exists paystack_webhook_events_paystack_id_unique;

-- Belt-and-braces: ensure the correct composite key from v13 exists (a DB that
-- somehow skipped v13 but ran v20 would otherwise be left with NO dedup key).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.paystack_webhook_events'::regclass
      and contype  = 'u'
      and conname  = 'paystack_webhook_events_event_type_paystack_id_key'
  ) then
    -- Only add if no equivalent composite unique already exists (v13 may have
    -- used a different generated name); guard on the column set, not the name.
    if not exists (
      select 1 from pg_constraint c
      where c.conrelid = 'public.paystack_webhook_events'::regclass
        and c.contype = 'u'
        and (
          select array_agg(a.attname order by a.attname)
          from unnest(c.conkey) k
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        ) = array['event_type','paystack_id']
    ) then
      alter table public.paystack_webhook_events
        add constraint paystack_webhook_events_event_type_paystack_id_key
        unique (event_type, paystack_id);
    end if;
  end if;
end$$;
