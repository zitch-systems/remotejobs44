-- Ownership-fenced cron locks. A stale runner may finish after its TTL and
-- must never release the lock subsequently acquired by another runner.
alter table public.cron_locks
  add column if not exists owner_token uuid;

create or replace function public.acquire_cron_lock(
  p_lock_name text,
  p_owner_token uuid,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare acquired boolean := false;
begin
  if p_lock_name is null or p_lock_name = '' or p_owner_token is null
     or p_ttl_seconds < 1 or p_ttl_seconds > 86400 then
    raise exception 'invalid cron lock arguments';
  end if;

  insert into public.cron_locks (name, acquired_at, expires_at, owner_token)
  values (p_lock_name, now(), now() + make_interval(secs => p_ttl_seconds), p_owner_token)
  on conflict (name) do update
    set acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at,
        owner_token = excluded.owner_token
    where public.cron_locks.expires_at < now()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_owned_cron_lock(
  p_lock_name text,
  p_owner_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.cron_locks
     where name = p_lock_name and owner_token = p_owner_token
    returning 1
  )
  select exists(select 1 from removed);
$$;

revoke all on function public.acquire_cron_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_owned_cron_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_cron_lock(text, uuid, integer) to service_role;
grant execute on function public.release_owned_cron_lock(text, uuid) to service_role;

notify pgrst, 'reload schema';
