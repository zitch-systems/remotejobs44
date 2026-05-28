-- ============================================================
-- RemoteJobs44 — Migration v11
-- Adds: jobs.flagged + jobs.flagged_reason for scam-pattern triage.
-- Idempotent — safe to re-run.
-- ============================================================
--
-- WHY
-- ---
-- Ingestion pulls verbatim from Remotive / Jobicy / RemoteOK / SerpApi /
-- Findwork and ALSO accepts LLM-hallucinated jobs from
-- /api/admin/ai-discovery. Until now nothing screened the result. For a
-- Nigerian-payments platform charging users ₦500–₦29,999, one viral
-- "I paid Pro and the jobs are scams" thread is unrecoverable.
--
-- This migration adds two columns:
--   * flagged          — server-side detector marks a row true when it
--                        matches a known scam pattern
--                        (Telegram/WhatsApp apply, free-webmail employer
--                        contact, MLM-marker phrases). lib/scam-detect.ts
--                        is the producer; admin moderation tools at
--                        /admin/jobs can clear/restore manually.
--   * flagged_reason   — human-readable string so admins can triage at a
--                        glance ("apply_via_telegram", "mlm_marker:downline").
--
-- Public job-listing queries should filter `.eq('flagged', false)` (or
-- .or('flagged.eq.false,flagged.is.null') to include legacy rows where
-- the column is null). Admin endpoints see everything.

alter table public.jobs
  add column if not exists flagged boolean not null default false,
  add column if not exists flagged_reason text;

-- Partial index keeps it tiny — only flagged rows have a "show me what
-- needs review" target. False rows (the vast majority) are not indexed.
create index if not exists jobs_flagged_idx
  on public.jobs(flagged)
  where flagged = true;
