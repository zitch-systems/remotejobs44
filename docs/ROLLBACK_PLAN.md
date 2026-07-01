# Hardening Phase 1 — Rollback Plan
Every change in this PR is independently reversible; none alters data, auth outcomes, APIs, URLs, or payment flows.

| Change | Rollback | Data risk |
|---|---|---|
| migration_v60 indexes (if applied to DB) | `drop index if exists public.applications_job_id_idx; drop index if exists public.saved_jobs_job_id_idx; drop index if exists public.job_alerts_user_id_idx;` | none — indexes only |
| 2FA purge-on-send (`app/api/admin/2fa/send/route.ts`) | `git revert <commit>` (single hunk). Purged rows were consumed/expired = inert; nothing to restore | none |
| docs/* + scripts/rls-verify.sql | delete files / git revert | none |

Whole-PR rollback: `git revert -m 1 <merge-commit>` on main → redeploy (Vercel keeps the previous deployment one click away as an instant rollback candidate).
