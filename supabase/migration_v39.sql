-- ============================================================
-- RemoteJobs44 — Migration v39
-- Run AFTER migration_v38.sql in: Supabase Dashboard → SQL Editor.
--
-- The mobile/web job feed sorts by `featured DESC, posted_at DESC` over ~54k
-- active rows, but no index covered that exact two-column sort (v37 only added
-- a single-column posted_at index). Every feed load did a full sort, which under
-- load could exceed the anon statement_timeout and return HTTP 500 — the app
-- then showed nothing / fell back to seed ("jobs not showing").
--
-- This composite partial index makes the feed query an index scan (fast, no
-- timeout). Idempotent — safe to re-run.
-- ============================================================

create index if not exists jobs_feed_order_idx
  on public.jobs (featured desc, posted_at desc) where is_active;

analyze public.jobs;
