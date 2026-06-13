-- ============================================================
-- RemoteJobs44 — Migration v34
-- Run AFTER migration_v33.sql in: Supabase Dashboard → SQL Editor.
--
-- Hardening follow-up to the agent referral program (v33):
--   * Cover agent_commissions.referred_user_id with an index.
--
-- The Supabase performance advisor flagged this FK as unindexed. The column
-- is referenced ON DELETE SET NULL, so when a referred user deletes their
-- account Postgres must find their commission rows to null them out — without
-- a covering index that's a sequential scan of the whole ledger. Partial on
-- non-null because the FK only ever matches non-null values and the column
-- trends toward NULL over time as referred users are removed (the ledger row
-- itself is retained — see the v33 ON DELETE SET NULL choice).
--
-- Idempotent — safe to re-run.
-- ============================================================

create index if not exists agent_commissions_referred_user_idx
  on public.agent_commissions (referred_user_id)
  where referred_user_id is not null;
