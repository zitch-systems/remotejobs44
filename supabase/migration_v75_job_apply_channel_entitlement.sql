-- Keep the direct mobile apply-channel RPC aligned with the server route:
-- visible jobs only, effective paid entitlement, and the Day Pass period cap.
create or replace function public.job_apply_channel(p_job_id uuid)
returns table (apply_url text, apply_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select j.apply_url, j.apply_email
  from public.jobs j
  where j.id = p_job_id
    and j.is_active = true
    and coalesce(j.flagged, false) = false
    and (j.expires_at is null or j.expires_at > now())
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.suspended, false) = false
        and (
          p.role = 'admin'
          or (
            p.plan = 'pro'
            and (p.plan_expires_at is null or p.plan_expires_at > now())
          )
          or (
            p.plan = 'daily'
            and p.plan_expires_at > now()
            and exists (
              select 1
              from public.subscriptions s
              where s.user_id = p.id
                and s.billing = 'daily'
                and s.status = 'active'
                and s.current_period_start <= now()
                and s.current_period_end > now()
                and (
                  exists (
                    -- Historical access to a channel already consumed by this
                    -- user remains available, including their tenth apply.
                    select 1 from public.applications a
                    where a.user_id = p.id and a.job_id = p_job_id
                  )
                  or (
                    select count(*)
                    from public.applications a
                    where a.user_id = p.id
                      and a.applied_at >= s.current_period_start
                  ) < 10
                )
              )
          )
        )
    );
$$;

revoke all on function public.job_apply_channel(uuid) from public, anon;
grant execute on function public.job_apply_channel(uuid) to authenticated;
