-- ============================================================
-- RemoteJobs44 — Migration v10
-- Adds: profiles.plan_expires_at (the column the entire effective-
-- plan / expiry-check pipeline depends on)
-- Idempotent — safe to re-run.
-- ============================================================
--
-- WHY
-- ---
-- /api/profile, /api/applications, Header.buildUser, login,
-- profile/page.tsx, dashboard/page.tsx, pricing/page.tsx, the
-- /api/cron/expire-daily cron, and lib/auth/plan.ts (the new
-- resolvePlan helper) all read profiles.plan_expires_at — but no
-- previous migration created the column. Production environments
-- that had it added manually via the Supabase dashboard kept
-- working; any env bootstrapped from setup.sql + migrations
-- shipped a profiles table where plan_expires_at was NULL on read
-- (or threw "column does not exist" depending on Supabase version),
-- which makes every expiry-check return "no expiry → trust DB plan"
-- → paid users keep access forever, expired Day Passes never lapse.
--
-- This migration:
--   (1) adds the column if missing (IF NOT EXISTS — no-op if prod
--       already had it),
--   (2) backfills it from the authoritative subscriptions table so
--       newly-cloned envs immediately reflect reality,
--   (3) adds an index for the cron's "find expired" sweep.

-- ── 1. add the column ──────────────────────────────────────
alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

-- ── 2. backfill from subscriptions (active rows only) ──────
-- Each profile gets the LATEST current_period_end across their
-- active subscriptions (a user may have had multiple subs over
-- time; we want the freshest one). Safe to re-run: only writes
-- when the new value is greater than the existing one.
update public.profiles p
   set plan_expires_at = sub.latest_end
  from (
    select user_id, max(current_period_end) as latest_end
      from public.subscriptions
     where status = 'active'
     group by user_id
  ) sub
 where p.id = sub.user_id
   and (p.plan_expires_at is null or sub.latest_end > p.plan_expires_at);

-- ── 3. index ───────────────────────────────────────────────
-- Cron expire-pass filters `plan_expires_at < now()` to find
-- users to downgrade. Partial index keeps it tiny — only rows
-- with a non-null expiry have a date the cron cares about.
create index if not exists profiles_plan_expires_at_idx
  on public.profiles(plan_expires_at)
  where plan_expires_at is not null;
