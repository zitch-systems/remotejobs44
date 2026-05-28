-- ============================================================
-- RemoteJobs44 — Migration v12
-- Adds: jobs.expires_at index so the .or('expires_at.is.null,expires_at.gt.now')
-- filter that /api/jobs and the server-side /jobs page now run on every
-- public read can use a real index instead of a seq scan.
-- Idempotent — safe to re-run.
-- ============================================================
--
-- Partial index — most rows have expires_at = null (the ATS upstream
-- didn't ship one). We only care about indexing the rows that have a
-- value so the partial keeps it small.

create index if not exists jobs_expires_at_idx
  on public.jobs(expires_at)
  where expires_at is not null;
