-- migration_v67: audit hardening and remote-listing performance
--
-- 1) Prevent callers from using the SECURITY DEFINER helper to probe arbitrary
--    profile UUIDs for admin status.
-- 2) Remove table-level privileges from service-only tables (RLS already
--    blocked rows, this is defense in depth).
-- 3) Cover the default remote listing/count visibility filters so the jobs
--    page can use an index-only scan rather than filtering heap rows.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select uid is not null
    and uid = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = uid and p.role = 'admin'
    );
$$;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_admin(uuid) from anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

revoke all on table public.admin_2fa_codes from anon, authenticated;
revoke all on table public.cron_locks from anon, authenticated;
revoke all on table public.paystack_transactions from anon, authenticated;
grant all on table public.admin_2fa_codes to service_role;
grant all on table public.cron_locks to service_role;
grant all on table public.paystack_transactions to service_role;

create index if not exists jobs_remote_visible_listing_idx
  on public.jobs (is_remote_compat, featured desc, posted_at desc)
  include (expires_at)
  where is_active = true
    and (flagged = false or flagged is null);
