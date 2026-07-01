# Hardening Phase 1 — Security Risk Report
Consolidates phase-by-phase status. Full static review: `SECURITY_REPORT.md`. **No critical vulnerabilities found; no auth/payment/SEO behavior was changed.**

| # | Phase | Finding | Status |
|---|---|---|---|
| 1 | Auth: profile-creation race | `handle_new_user` ON CONFLICT | ✅ already (v3:58, v22:51) — no change |
| 2 | Admin RBAC compat | DB-role OR hardcoded-email, suspended kill-switch | ✅ already — duplicate `admins` table **rejected** (two sources of truth; see ADMIN_AUDIT.md) |
| 3 | RLS coverage | enabled on all 20 tables in migrations; uid-based policies; column-level paywall grants | ✅ in repo · ⚠️ live parity unverifiable from here → `scripts/rls-verify.sql` for operator |
| 4 | Webhook idempotency | insert-claim dedup (unique event_type+paystack_id) + reference ledger + amount-vs-plan validation | ✅ already — prompt's `processed_webhooks` table **rejected** as a weaker duplicate |
| 5 | Indexes | 20+ exist incl. GIN FTS + trigram; 3 genuine gaps | ✅ FIXED — migration_v60 (applications/saved_jobs job_id, job_alerts user_id) |
| 6 | Admin MFA | expiry/replay/attempt-limits present; dead-row cleanup missing | ✅ FIXED — purge-on-send (2fa/send route) |
| 7 | Audit logging | `admin_actions` + recordAdminAction (role/billing/deletion/suspension paths) | ✅ already — generic `audit_logs` duplicate **rejected** |
| 8 | Observability | Vercel Analytics + SpeedInsights + structured JSON logs w/ webhook alerting exist; Sentry/OTel absent | ⛔ BLOCKED — needs SENTRY_DSN/creds (Sentry MCP unauthenticated in this env). Additive install ready to do once a DSN exists; dead config was not shipped on principle |
| 9 | Known open items (pre-existing, unchanged) | in-memory rate limiter (multi-region gap → Upstash), ADMIN_2FA_SECRET fallback to service-role key, zod unused at API boundaries, Playwright not in CI | 📋 tracked in TECHNICAL_DEBT.md — each needs credentials or its own tested PR |

Residual top risks, in order: (1) live-RLS parity unverified from repo; (2) rate limiting not cluster-wide; (3) no error-tracing SaaS wired.
