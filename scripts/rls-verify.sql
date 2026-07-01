-- Read-only RLS parity check for production (Hardening Phase 1).
-- Run in the Supabase SQL editor. Expect: every public table rowsecurity=true.
select t.tablename,
       t.rowsecurity,
       coalesce(p.n_policies, 0) as n_policies
from pg_tables t
left join (
  select tablename, count(*)::int as n_policies
  from pg_policies where schemaname = 'public' group by tablename
) p using (tablename)
where t.schemaname = 'public'
order by t.rowsecurity asc, t.tablename;
-- Any rowsecurity=false row, or a user-data table with n_policies=0 that is
-- NOT intentionally server-only (webhook events, transactions, 2fa codes,
-- cron locks, ai provider configs), needs an additive migration.
