-- ============================================================
-- RemoteJobs44 — Migration v36
-- Run AFTER migration_v35.sql in: Supabase Dashboard → SQL Editor.
--
-- Exact, DB-side commission aggregation for the agent + admin portals, so the
-- displayed totals never depend on a row-fetch cap (the routes previously
-- pulled up to 5k / 50k rows and summed in JS). All three are SECURITY INVOKER
-- (they run as the calling service_role, which bypasses RLS) and EXECUTE is
-- locked to service_role, so they're never exposed on the public PostgREST
-- surface for anon / authenticated — and they add no SECURITY DEFINER advisor
-- warnings.
--
-- Idempotent — safe to re-run (create or replace + idempotent grants).
-- ============================================================

create or replace function public.agent_commission_summary(p_agent_id uuid)
returns table (
  charges bigint,
  subscribers bigint,
  total_commission numeric,
  paid_commission numeric,
  pending_commission numeric
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select
    count(*)::bigint,
    count(distinct referred_user_id)::bigint,
    coalesce(sum(commission_amount), 0)::numeric,
    coalesce(sum(commission_amount) filter (where status = 'paid'), 0)::numeric,
    coalesce(sum(commission_amount) filter (where status not in ('paid','reversed')), 0)::numeric
  from public.agent_commissions
  where agent_id = p_agent_id;
$$;

create or replace function public.agent_commission_plan_breakdown(p_agent_id uuid)
returns table (plan text, count bigint, gross numeric, commission numeric)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select plan,
         count(*)::bigint,
         coalesce(sum(amount), 0)::numeric,
         coalesce(sum(commission_amount), 0)::numeric
  from public.agent_commissions
  where agent_id = p_agent_id
  group by plan;
$$;

create or replace function public.agent_commission_admin_summary()
returns table (
  agent_id uuid,
  charges bigint,
  subscribers bigint,
  total_commission numeric,
  unpaid_commission numeric
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select agent_id,
         count(*)::bigint,
         count(distinct referred_user_id)::bigint,
         coalesce(sum(commission_amount), 0)::numeric,
         coalesce(sum(commission_amount) filter (where status not in ('paid','reversed')), 0)::numeric
  from public.agent_commissions
  where agent_id is not null
  group by agent_id;
$$;

revoke all on function public.agent_commission_summary(uuid)        from public, anon, authenticated;
revoke all on function public.agent_commission_plan_breakdown(uuid) from public, anon, authenticated;
revoke all on function public.agent_commission_admin_summary()      from public, anon, authenticated;
grant execute on function public.agent_commission_summary(uuid)        to service_role;
grant execute on function public.agent_commission_plan_breakdown(uuid) to service_role;
grant execute on function public.agent_commission_admin_summary()      to service_role;
