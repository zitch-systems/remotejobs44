# Hardening Phase 1 — Migration Report
## New migration files (this PR — additive only; NO historical migration touched)
**`supabase/migration_v60_hardening_indexes.sql`** — 3 × `create index if not exists` (applications_job_id_idx, saved_jobs_job_id_idx, job_alerts_user_id_idx). No table/column/policy/trigger changes. Safe to apply during traffic (small tables / plain btree; use `CREATE INDEX CONCURRENTLY` variant manually if applications has grown very large by apply time).

## How to apply (operator — this environment cannot reach the live project)
Supabase dashboard → SQL editor → paste the file → run. Idempotent (`IF NOT EXISTS`) — re-running is a no-op.

## Explicitly NOT created (rationale in ADMIN_AUDIT.md / SECURITY_RISK_REPORT.md)
- `admins`, `admin_audit_logs`, `audit_logs`, `processed_webhooks` — each would duplicate an existing, stronger mechanism (profiles.role+suspended, admin_actions, paystack_webhook_events+paystack_transactions) creating dual sources of truth.
- ON CONFLICT profile-trigger migration — already present since v3.

## Rollback
`drop index if exists public.applications_job_id_idx, ...` — see ROLLBACK_PLAN.md. Zero data impact.
