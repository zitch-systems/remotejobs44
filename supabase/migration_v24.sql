-- ============================================================
-- RemoteJobs44 — Migration v24
-- Drop the profile_completion=20 default. Round 30 lifted
-- profile_completion into a dynamic recompute against the actual
-- signal set (name, email_confirmed, cv_url, ≥1 application,
-- ≥1 saved job). A `default 20` on the column means every fresh
-- signup starts with 20 even though zero signals are set —
-- /dashboard then drops to the honest value (often 0–20) the
-- first time /api/profile or any write path recomputes, which
-- looks like a regression to the user.
--
-- Default 0 means the dashboard ring at signup reads honest. The
-- numbers go UP from there as users actually do things. The
-- recompute helper still writes the canonical value when any
-- signal fires.
--
-- Existing rows have already been backfilled to honest values
-- via migration_v23 — this only affects future signups.
-- ============================================================

begin;

alter table public.profiles
  alter column profile_completion set default 0;

commit;
