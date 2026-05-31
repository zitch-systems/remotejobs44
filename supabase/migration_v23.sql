-- ============================================================
-- RemoteJobs44 — Migration v23
-- Backfill profile_completion against the round-30 helper.
--
-- profile_completion was a hardcoded literal (20 on signup, 80
-- after CV upload) until round 30 lifted it into a dynamic
-- recompute. The recompute fires on every /api/profile GET and
-- every write path that affects a signal (cv upload, application,
-- saved job) — but users who never hit any of those between the
-- rollout and now stay at the stale literal.
--
-- One-shot recompute against the SAME formula the helper uses
-- (lib/auth/profile-completion.ts), so the dashboard ring shows
-- honest numbers immediately for everyone.
--
-- Signals worth distinct amounts:
--   name set to non-email-prefix default  +20
--   email_confirmed_at non-null            +20
--   cv_url set                             +30
--   ≥1 application                         +15
--   ≥1 saved job                           +15
-- Cap at 100.
--
-- Idempotent: re-running on a DB that already matches the helper
-- is a no-op (the WHERE filters out rows where stored == computed).
-- ============================================================

begin;

update public.profiles p
set
  profile_completion = least(100,
    (case when p.name is not null
            and length(trim(p.name)) > 0
            and lower(trim(p.name)) <> lower(split_part(coalesce(p.email,''), '@', 1))
          then 20 else 0 end) +
    (case when au.email_confirmed_at is not null then 20 else 0 end) +
    (case when p.cv_url is not null and length(trim(p.cv_url)) > 0 then 30 else 0 end) +
    (case when exists(select 1 from public.applications a where a.user_id = p.id) then 15 else 0 end) +
    (case when exists(select 1 from public.saved_jobs s where s.user_id = p.id) then 15 else 0 end)
  ),
  updated_at = now()
from auth.users au
where au.id = p.id
  and p.profile_completion is distinct from least(100,
    (case when p.name is not null
            and length(trim(p.name)) > 0
            and lower(trim(p.name)) <> lower(split_part(coalesce(p.email,''), '@', 1))
          then 20 else 0 end) +
    (case when au.email_confirmed_at is not null then 20 else 0 end) +
    (case when p.cv_url is not null and length(trim(p.cv_url)) > 0 then 30 else 0 end) +
    (case when exists(select 1 from public.applications a where a.user_id = p.id) then 15 else 0 end) +
    (case when exists(select 1 from public.saved_jobs s where s.user_id = p.id) then 15 else 0 end)
  );

commit;
