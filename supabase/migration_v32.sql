-- migration_v32.sql
-- Record the out-of-band jobs listing-performance objects + adopt
-- is_remote_compat in code.
--
-- Context: production has FOUR schema objects that exist in the live
-- database but in none of the repo's migrations — a generated
-- remote-compat column and three partial listing indexes. They were
-- evidently created directly in the SQL editor during an earlier
-- performance push and never written down, so any environment rebuilt
-- from supabase/*.sql would silently lack them — and the code change
-- shipping alongside this migration (filtering on is_remote_compat in
-- /jobs SSR + /api/jobs) would 400 on such an environment. This file
-- closes that gap. Every statement is idempotent (IF NOT EXISTS), so
-- applying it against production — where the objects already exist —
-- is a no-op.
--
-- Why is_remote_compat exists: the "Remote only" listing filter used to
-- be sent as
--   or(remote.eq.true,location.imatch.remote|worldwide|anywhere|global|distributed|wfh)
-- which Postgres can only evaluate row-by-row: EXPLAIN ANALYZE on prod
-- (84,547 rows) showed the default /jobs page walking 72,166 index
-- entries and regex-filtering away 55,731 of them — 203ms warm /
-- 57,967 shared buffers for 50 rows, and seconds when cold. The STORED
-- generated column bakes the SAME boolean down at write time (Postgres
-- recomputes it on every INSERT/UPDATE of the row — it cannot go
-- stale), and the partial index serves it: 36ms / 15,151 buffers for
-- the page, 34ms for the count, with a byte-identical result set
-- (16,435 = 16,435 verified both ways).
--
-- NULL-remote semantics match the old OR chain exactly: remote IS NULL
-- fails remote.eq.true and COALESCE(remote,false) alike, falling
-- through to the location regex in both versions.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_remote_compat boolean
  GENERATED ALWAYS AS (
    COALESCE(remote, false)
    OR location ~* '(remote|worldwide|anywhere|global|distributed|wfh)'
  ) STORED;

-- Serves the "Remote only" listing + count (equality on the generated
-- column; ordering columns let the planner avoid a separate sort for
-- recency-ordered variants).
CREATE INDEX IF NOT EXISTS jobs_is_remote_compat_idx
  ON public.jobs (is_remote_compat, posted_at DESC, featured DESC)
  WHERE is_active = true;

-- Featured-first default ordering for the all-locations listing.
CREATE INDEX IF NOT EXISTS jobs_listing_featured_first_idx
  ON public.jobs (featured DESC, posted_at DESC NULLS LAST)
  WHERE is_active = true AND ((NOT flagged) OR flagged IS NULL);

-- Recency-first variant of the same visible-listing predicate.
CREATE INDEX IF NOT EXISTS jobs_visible_listing_idx
  ON public.jobs (posted_at DESC NULLS LAST, featured DESC)
  WHERE is_active = true AND ((NOT flagged) OR flagged IS NULL);
