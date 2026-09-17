-- Expiry takes the same profile lock, in the same order, as fulfillment.
-- Both subscription expiry and profile downgrade commit or roll back together.
create or replace function public.expire_subscriptions(p_batch_size integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_user_id uuid;
  v_billing text;
  v_daily integer := 0;
  v_pro integer := 0;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'Batch size must be between 1 and 1000';
  end if;
  for v_user_id in
    select p.id from public.profiles p
    where exists (
      select 1 from public.subscriptions s where s.user_id = p.id and (
        (s.billing = 'daily' and s.status = 'active' and s.current_period_end < now())
        or (s.billing in ('monthly', 'annually')
          and s.status in ('active', 'cancelled', 'payment_failed')
          and s.current_period_end < now() - interval '24 hours')
      )
    )
    order by p.id limit p_batch_size for update of p skip locked
  loop
    -- Re-check after acquiring the profile lock: a renewal may have committed
    -- since the candidate scan. Never downgrade from a stale list of user IDs.
    update public.subscriptions s set status = 'expired', updated_at = now()
    where s.user_id = v_user_id and (
      (s.billing = 'daily' and s.status = 'active' and s.current_period_end < now())
      or (s.billing in ('monthly', 'annually')
        and s.status in ('active', 'cancelled', 'payment_failed')
        and s.current_period_end < now() - interval '24 hours')
    ) returning s.billing into v_billing;
    if found then
      update public.profiles set plan = 'free', updated_at = now()
      where id = v_user_id and role <> 'admin' and plan <> 'admin'
        -- Preserve a separately granted, still-current entitlement.
        and (plan_expires_at is null or plan_expires_at <= now());
      if v_billing = 'daily' then v_daily := v_daily + 1;
      else v_pro := v_pro + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('expiredDayPasses', v_daily, 'expiredPro', v_pro);
end;
$$;
revoke all on function public.expire_subscriptions(integer) from public, anon, authenticated;
grant execute on function public.expire_subscriptions(integer) to service_role;
