-- The existing UPDATE guard does not protect INSERT. An authenticated user
-- with a missing profile must not create that profile with paid/admin access.
create or replace function public.profiles_guard_insert_privileged()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.role() is distinct from 'service_role' then
    if new.role is distinct from 'user' or new.plan is distinct from 'free'
      or new.plan_expires_at is not null or coalesce(new.suspended, false)
      or new.commission_rate is distinct from 0 then
      raise exception 'Privileged profile fields require a trusted server';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_guard_insert_privileged() from public, anon, authenticated;
drop trigger if exists profiles_guard_insert_privileged on public.profiles;
create trigger profiles_guard_insert_privileged before insert on public.profiles
for each row execute function public.profiles_guard_insert_privileged();
