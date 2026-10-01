-- Atomically verify an admin email OTP and consume one attempt.
-- Service role only: browser roles cannot inspect hashes or invoke this helper.
create or replace function public.verify_admin_2fa_code(
  p_user_id uuid,
  p_submitted_hash text,
  p_max_attempts integer default 5
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_code public.admin_2fa_codes%rowtype;
  v_attempts integer;
begin
  if p_user_id is null or p_submitted_hash is null or p_max_attempts < 1 then
    return 'missing';
  end if;

  select * into v_code
  from public.admin_2fa_codes
  where user_id = p_user_id
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then return 'missing'; end if;
  if v_code.attempts >= p_max_attempts then
    update public.admin_2fa_codes set consumed_at = now() where id = v_code.id;
    return 'locked';
  end if;
  if v_code.code_hash = p_submitted_hash then
    update public.admin_2fa_codes set consumed_at = now() where id = v_code.id;
    return 'verified';
  end if;

  v_attempts := v_code.attempts + 1;
  update public.admin_2fa_codes
  set attempts = v_attempts,
      consumed_at = case when v_attempts >= p_max_attempts then now() else consumed_at end
  where id = v_code.id;
  return case when v_attempts >= p_max_attempts then 'locked' else 'mismatch' end;
end;
$$;

revoke all on function public.verify_admin_2fa_code(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.verify_admin_2fa_code(uuid,text,integer) to service_role;
