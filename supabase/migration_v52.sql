-- ============================================================
-- RemoteJobs44 — Migration v52
-- Run AFTER migration_v51.sql in: Supabase Dashboard → SQL Editor.
--
-- Performance advisor cleanup (zero access-logic change):
--  1) Wrap auth.uid() in a subselect in the two remaining unwrapped policies so
--     it's evaluated once per query, not per row (auth_rls_initplan). Uses
--     ALTER POLICY so the command + roles are preserved exactly.
--  2) Add indexes on three unindexed foreign-key columns (unindexed_foreign_keys)
--     to speed FK checks / cascades / joins.
--
-- Idempotent — safe to re-run.
-- ============================================================

alter policy "Users manage own push tokens" on public.device_push_tokens
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter policy "referrals_select_own" on public.referrals
  using ((select auth.uid()) = referrer_id);

create index if not exists notifications_job_id_idx          on public.notifications (job_id);
create index if not exists paystack_transactions_user_id_idx on public.paystack_transactions (user_id);
create index if not exists referrals_referred_id_idx         on public.referrals (referred_id);
