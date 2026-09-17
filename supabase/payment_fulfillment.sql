-- Atomic, service-only payment fulfillment. All three writes commit or roll back
-- together. Do not replace this with independent REST inserts/updates.
create or replace function public.fulfill_paystack_charge(
  p_reference text, p_user_id uuid, p_selection text,
  p_amount integer, p_currency text,
  p_customer_code text default null, p_subscription_code text default null,
  p_email_token text default null
) returns jsonb
language plpgsql security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_profile public.profiles%rowtype;
  v_charge public.paystack_transactions%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_tier text;
  v_billing text;
  v_expected integer;
  v_expiry timestamptz;
begin
  if p_reference is null or p_reference !~ '^[A-Za-z0-9_-]{1,200}$' or p_user_id is null then
    raise exception 'Invalid payment reference or account';
  end if;
  v_expected := case p_selection when 'daily' then 50000 when 'pro' then 299900 when 'pro_annual' then 2999900 end;
  if v_expected is null or p_amount is null or p_currency is distinct from 'NGN'
    or abs(p_amount::bigint - v_expected) > 100 then
    raise exception 'Invalid payment plan, amount or currency';
  end if;
  v_tier := case when p_selection = 'daily' then 'daily' else 'pro' end;
  v_billing := case p_selection when 'daily' then 'daily' when 'pro_annual' then 'annually' else 'monthly' end;

  -- Serialize all purchases for this user, including DIFFERENT references.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Payment account not found'; end if;
  select * into v_charge from public.paystack_transactions where reference = p_reference;
  if found then
    if v_charge.user_id is distinct from p_user_id then raise exception 'Payment account mismatch'; end if;
    return jsonb_build_object('credited', false, 'plan', v_charge.plan, 'expires_at', v_profile.plan_expires_at);
  end if;
  select * into v_subscription from public.subscriptions where paystack_reference = p_reference;
  if found and v_subscription.user_id is distinct from p_user_id then raise exception 'Payment account mismatch'; end if;

  -- A lower-tier delayed payment must not erase an active higher entitlement.
  -- Leave it retryable and visible to support instead of silently consuming it.
  if v_subscription.id is null and v_profile.role <> 'admin'
    and v_profile.plan = 'pro' and v_profile.plan_expires_at > now() and v_tier = 'daily' then
    raise exception 'Lower-tier charge requires review while Pro access is active';
  end if;

  insert into public.paystack_transactions(reference, user_id, plan, selection, amount, currency)
    values(p_reference, p_user_id, v_tier, p_selection, p_amount, p_currency);
  -- Backfill the immutable ledger for an already-credited legacy subscription.
  if v_subscription.id is not null then
    return jsonb_build_object('credited', false, 'plan', v_subscription.plan, 'expires_at', v_subscription.current_period_end);
  end if;

  v_expiry := greatest(now(), coalesce(v_profile.plan_expires_at, now()))
    + case p_selection when 'daily' then interval '24 hours' when 'pro_annual' then interval '1 year' else interval '1 month' end;
  if v_profile.role <> 'admin' then
    update public.profiles set plan = v_tier, plan_expires_at = v_expiry, updated_at = now() where id = p_user_id;
  end if;
  insert into public.subscriptions(user_id, plan, billing, status, paystack_reference,
    paystack_customer_code, paystack_subscription_code, paystack_email_token,
    current_period_start, current_period_end, currency, price)
  values(p_user_id, v_tier, v_billing, 'active', p_reference, p_customer_code,
    p_subscription_code, p_email_token, now(), v_expiry, p_currency, p_amount::numeric / 100)
  on conflict (user_id) do update set
    plan = excluded.plan, billing = excluded.billing, status = excluded.status,
    paystack_reference = excluded.paystack_reference,
    paystack_customer_code = excluded.paystack_customer_code,
    paystack_subscription_code = excluded.paystack_subscription_code,
    paystack_email_token = excluded.paystack_email_token,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    currency = excluded.currency, price = excluded.price, updated_at = now();
  return jsonb_build_object('credited', true, 'plan', v_tier, 'expires_at', v_expiry);
end;
$$;
revoke all on function public.fulfill_paystack_charge(text,uuid,text,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.fulfill_paystack_charge(text,uuid,text,integer,text,text,text,text) to service_role;

-- A received webhook is not necessarily a successfully processed webhook.
alter table public.paystack_webhook_events alter column processed set default false;
