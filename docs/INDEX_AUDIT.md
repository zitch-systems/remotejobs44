# Hardening Phase 1 — Index Audit
Method: exhaustive grep of `create index` across `supabase/*.sql`, then each prompt-suggested index checked against the REAL schema and REAL query paths (several suggestions referenced columns/queries that don't exist here).

## Existing (verified in migrations — no action)
jobs: posted_at desc · category · featured · is_active · expires_at · flagged (partial) · is_remote_compat (partial, v32) · search_vector **GIN** · title/company/location **trigram** — applications: user_id · unique(user_id, job_id) — saved_jobs: user_id · unique(user_id, job_id) — profiles: plan_expires_at · unique referral_code — notifications(user_id, created_at desc) — paystack_webhook_events: unique(event_type, paystack_id) + received_at — paystack_transactions: user_id (+reference PK) — referrals(referrer_id) — device_push_tokens(user_id) — admin_2fa_codes(user_id, created_at desc) — subscriptions: unique(user_id).

## Added (migration_v60_hardening_indexes.sql — IF NOT EXISTS, reversible)
| Index | Why |
|---|---|
| `applications(job_id)` | FK to jobs had no job_id-leading path — job deletion cascades scanned applications; "applicants for job X" unindexed. unique(user_id, job_id) only serves user-first. |
| `saved_jobs(job_id)` | identical shape/reason |
| `job_alerts(user_id)` | only per-user table with NO user_id index (alerts page + matcher) |

## Rejected from the prompt's list (with reasons)
- `jobs(company_id)` — column exists, **no query filters it** (grep: only read/written as data)
- `jobs(remote_type)` — column doesn't exist (schema uses `remote` bool + `is_remote_compat` generated, already partial-indexed)
- `jobs(timezone)` — facet goes through the search RPC as escaped **ILIKE**; btree unusable
- `jobs(created_at)` — sorts use `posted_at desc` (indexed)
- `profiles(plan)` — only admin planTotals aggregates it; low traffic, revisit on evidence
- GIN for tags/skills — no such columns; skills are a derived slice, FTS GIN already exists
