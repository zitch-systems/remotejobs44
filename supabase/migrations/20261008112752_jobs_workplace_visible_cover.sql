-- The current discovery filters use workplace_type, not is_remote_compat.
-- Cover expiry checks so exact counts avoid reading thousands of heap pages.
-- Match the featured-first feed ordering for the paginated rows too.
-- On the existing production table this index was built CONCURRENTLY before
-- recording the migration, keeping ingestion available during the build.
CREATE INDEX IF NOT EXISTS jobs_workplace_visible_cover_idx
  ON public.jobs (workplace_type, featured DESC, posted_at DESC)
  INCLUDE (expires_at)
  WHERE is_active = true AND (flagged = false OR flagged IS NULL);
