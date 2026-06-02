-- migration_v29.sql
-- Lock down SECURITY DEFINER functions that only the server-side
-- service-role client ever calls, so they can't be invoked from the public
-- PostgREST API (/rest/v1/rpc/...) by anon/authenticated. Clears the
-- Supabase "anon/authenticated can execute SECURITY DEFINER function"
-- advisor warnings for these three.
--
--   * companies_aggregate()            -- only /api/companies (admin client)
--   * try_acquire_cron_lock(text,int)  -- only the ingest pipeline (admin)
--   * release_cron_lock(text)          -- only the ingest pipeline (admin)
--
-- is_admin(uuid) is deliberately NOT touched: it is referenced inside RLS
-- policies (fix_rls_recursion.sql), so `authenticated` must keep EXECUTE.
--
-- Applied to the live DB in-session via MCP (same as v26/v27/v28).

revoke all on function public.companies_aggregate() from public, anon, authenticated;
grant execute on function public.companies_aggregate() to service_role;

revoke all on function public.try_acquire_cron_lock(text, integer) from public, anon, authenticated;
grant execute on function public.try_acquire_cron_lock(text, integer) to service_role;

revoke all on function public.release_cron_lock(text) from public, anon, authenticated;
grant execute on function public.release_cron_lock(text) to service_role;
