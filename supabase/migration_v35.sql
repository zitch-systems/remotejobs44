-- ============================================================
-- RemoteJobs44 — Migration v35
-- Run AFTER migration_v34.sql in: Supabase Dashboard → SQL Editor.
--
-- Retain the agent commission ledger when an agent is deleted.
--
-- v33 created agent_commissions.agent_id as ON DELETE CASCADE, so deleting an
-- agent (admin → delete user → auth.users cascade) erased their entire payout
-- history. For a commission system that's a financial-record gap. This switches
-- the FK to ON DELETE SET NULL and denormalizes the agent's identity onto each
-- row, so a retained row still says who it was owed to after the profile is
-- gone. (referred_user_id is already ON DELETE SET NULL from v33, and we do NOT
-- denormalize the referred user's PII — their link is correctly erased.)
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Denormalize agent identity for post-deletion attribution.
alter table public.agent_commissions
  add column if not exists agent_email text,
  add column if not exists agent_name  text;

update public.agent_commissions ac
   set agent_email = p.email, agent_name = p.name
  from public.profiles p
 where p.id = ac.agent_id
   and ac.agent_email is null;

-- 2. Keep the row (agent_id -> NULL) instead of cascading the delete.
alter table public.agent_commissions
  alter column agent_id drop not null;

alter table public.agent_commissions
  drop constraint if exists agent_commissions_agent_id_fkey;

alter table public.agent_commissions
  add constraint agent_commissions_agent_id_fkey
  foreign key (agent_id) references public.profiles(id) on delete set null;
