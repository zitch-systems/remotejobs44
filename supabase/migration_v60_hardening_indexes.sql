-- migration_v60_hardening_indexes.sql
-- Production-hardening Phase 1 (additive, reversible — see docs/ROLLBACK_PLAN.md).
--
-- Three indexes that closed the gaps found by the Phase-1 index audit
-- (docs/INDEX_AUDIT.md). Everything else the audit checked already exists:
-- jobs(posted_at desc / category / featured / is_active / expires_at /
-- flagged partial / is_remote_compat partial), the GIN search_vector index,
-- trigram indexes on title/company/location, profiles(plan_expires_at),
-- notifications(user_id, created_at), and the webhook-dedup unique index.
--
-- 1) applications(job_id) — the FK to jobs has no job_id-leading index. The
--    existing unique(user_id, job_id) serves user-first lookups (the apply
--    dup-check filters both columns), but an admin deleting a job makes
--    Postgres scan applications per-row to enforce the FK cascade, and any
--    "applicants for job X" query has no path. Standard FK-index insurance.
create index if not exists applications_job_id_idx
  on public.applications (job_id);

-- 2) saved_jobs(job_id) — same shape, same reason (unique(user_id, job_id)
--    exists; job_id-leading path doesn't).
create index if not exists saved_jobs_job_id_idx
  on public.saved_jobs (job_id);

-- 3) job_alerts(user_id) — the only per-user table with NO user_id index;
--    every alerts-page load and the alert-matching job filter on it.
create index if not exists job_alerts_user_id_idx
  on public.job_alerts (user_id);

-- Deliberately NOT added (documented in docs/INDEX_AUDIT.md):
--   * jobs(company_id)  — column exists but no query filters on it today.
--   * jobs(timezone)    — the timezone facet goes through the search RPC as
--                         an escaped ILIKE; a btree would never be used.
--   * profiles(plan)    — only the admin users screen aggregates by plan
--                         (low traffic, small table); revisit if it slows.
--   * jobs(created_at)  — listing sort uses posted_at desc, already indexed.
