-- Category filters previously combined bitmap indexes then visited the heap
-- for expiry checks. Cover category, workplace, visibility and feed ordering,
-- including the common type/level refinements for exact count queries.
-- Built concurrently in production before recording the migration.
CREATE INDEX IF NOT EXISTS jobs_category_workplace_visible_cover_idx
  ON public.jobs (category, workplace_type, featured DESC, posted_at DESC)
  INCLUDE (expires_at, type, level)
  WHERE is_active = true AND (flagged = false OR flagged IS NULL);
