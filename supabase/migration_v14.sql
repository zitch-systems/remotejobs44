-- ============================================================
-- RemoteJobs44 — Migration v14
-- Adds: cron_locks table + try_acquire_cron_lock() helper so multiple
-- runners can't overlap on the ingest pipeline.
-- Idempotent — safe to re-run.
-- ============================================================
--
-- WHY
-- ---
-- runIngest() is callable from THREE places:
--   * /api/cron/daily       (scheduled 06:00 UTC)
--   * /api/cron/ingest      (manual debug re-trigger)
--   * /api/admin/ingest-now (admin Run Now button)
--
-- Without a lock, an admin clicking Run Now while the daily cron is
-- mid-run causes two parallel ingestions to both insert the same
-- upstream jobs — the no-dedup decision means those duplicate rows
-- aren't collapsed. After enough overlaps the jobs table grows
-- multiples faster than necessary, count() queries slow down, and
-- /admin/jobs shows the same posting 4-5 times.
--
-- Solution: a tiny `cron_locks` table with one row per lock name.
-- `try_acquire_cron_lock(lock_name, ttl_seconds)` atomically inserts-
-- or-takes-over the row when the existing holder has expired. Returns
-- true when the caller now holds the lock, false when another runner
-- still holds it. Callers MUST release on exit (or let the TTL expire
-- safely if the runner crashes).

create table if not exists public.cron_locks (
  name         text primary key,
  acquired_at  timestamptz not null default now(),
  expires_at   timestamptz not null
);

alter table public.cron_locks enable row level security;

-- Only the service role touches this. No public read needed.
drop policy if exists cron_locks_service_role on public.cron_locks;
create policy cron_locks_service_role
  on public.cron_locks for all
  using ( auth.role() = 'service_role' );

-- Atomic acquire. Returns true when the caller now holds the lock.
-- Behaviour:
--   * No existing row → INSERT new lock. Returns true.
--   * Existing row, expires_at in the past → UPDATE (take over). Returns true.
--   * Existing row, still held → ON CONFLICT no-op. Returns false.
create or replace function public.try_acquire_cron_lock(lock_name text, ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  insert into public.cron_locks (name, acquired_at, expires_at)
    values (lock_name, now(), now() + (ttl_seconds || ' seconds')::interval)
    on conflict (name) do update
      set acquired_at = excluded.acquired_at,
          expires_at  = excluded.expires_at
      where public.cron_locks.expires_at < now()
    returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

revoke all on function public.try_acquire_cron_lock(text, int) from public;
grant execute on function public.try_acquire_cron_lock(text, int) to service_role;

create or replace function public.release_cron_lock(lock_name text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cron_locks where name = lock_name;
$$;

revoke all on function public.release_cron_lock(text) from public;
grant execute on function public.release_cron_lock(text) to service_role;
