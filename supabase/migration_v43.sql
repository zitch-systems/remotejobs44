-- ============================================================
-- RemoteJobs44 — Migration v43
-- Run AFTER migration_v42.sql in: Supabase Dashboard → SQL Editor.
--
-- Security advisor: audit_profile_role_change() is a SECURITY DEFINER *trigger*
-- function that was also callable as a public RPC (/rest/v1/rpc/...). Triggers
-- fire regardless of the caller's EXECUTE grant, so revoking EXECUTE removes the
-- RPC exposure with no effect on the trigger.
--
-- NOTE: is_admin(uuid) is intentionally left EXECUTE-able by anon/authenticated.
-- It is called inside multiple RLS policies (jobs, profiles, subscriptions, …);
-- revoking it would break those policies, and it must stay SECURITY DEFINER to
-- avoid infinite recursion in the profiles policies (see fix_rls_recursion.sql).
-- The exposure is a boolean admin-check for a given uuid — low risk.
--
-- Idempotent — safe to re-run.
-- ============================================================

revoke execute on function public.audit_profile_role_change() from anon, authenticated, public;
