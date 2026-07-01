# Hardening Phase 1 — System Inventory
**Date:** 2026-07-02 · **Scope:** repo `main` @ merge of PR #141 · companion docs: `SECURITY_RISK_REPORT.md`, `AUTH_AUDIT.md`, `ADMIN_AUDIT.md`, `RLS_AUDIT.md`, `INDEX_AUDIT.md`, `MIGRATION_REPORT.md`, `FIX_SUMMARY.md`, `ROLLBACK_PLAN.md`. Deep-dives already in repo: `ARCHITECTURE_AUDIT.md`, `SECURITY_REPORT.md`.

## Authentication & authorization
- Supabase SSR auth: `middleware.ts`, `lib/supabase/{server,client,cookies}.ts`; chunked-cookie helper `hasSupabaseAuthCookie()` (unit-tested).
- Flows: OAuth + PKCE and token-hash email flows via `app/auth/callback/route.ts`; login/register/forgot/reset pages; session refresh with transient-error guards (`AuthSyncProvider`).
- Guards: `requireAdmin`/`getAdminUser` (`lib/admin/auth.ts`), `requireAgent` (`lib/agent/auth.ts`), `requireCronSecret` (`lib/cron-auth.ts`).
- Admin MFA: email OTP (`app/api/admin/2fa/{send,verify,status}`, `lib/auth/admin-2fa-server.ts`), off by default via `NEXT_PUBLIC_ADMIN_MFA_REQUIRED`.

## Admin systems
- `/admin/*` (18 pages) gated at middleware (full `getUser()` + role) + client layout + per-route `requireAdmin`.
- Audit trail: `admin_actions` table + `recordAdminAction()` (row-before-delete captured).
- Kill switch: `profiles.suspended` (works even for hardcoded admin emails).

## API surface
- 54 route handlers under `app/api/**`; no Server Actions (all mutations via routes). Business logic in `lib/*` (see ARCHITECTURE_AUDIT §3).
- Webhooks: Paystack (`app/api/paystack/webhook`) — HMAC (timing-safe) → insert-claim dedup → process; reference ledger `paystack_transactions` for charges.
- Cron: `/api/cron/*` behind `requireCronSecret` (timing-safe compare); `cron_locks` table for distributed locking.
- AI endpoints: `app/api/ai/*` (CV review etc.) — prompt-injection escaping, rate-limited; provider config `ai_provider_configs` (encrypted secrets).

## Database (from 60 committed migrations, `supabase/*.sql`)
- Tables: profiles, jobs, job_sources, saved_jobs, applications, job_alerts, notifications, subscriptions, paystack_webhook_events, paystack_transactions, referrals, referral_clicks, agent_commissions, device_push_tokens, mobile_devices, site_settings, admin_actions, admin_2fa_codes, cron_locks, ai_provider_configs.
- RLS enabled on every table above (see RLS_AUDIT.md); `is_admin()` SECURITY DEFINER avoids policy recursion.
- Triggers: `handle_new_user` (auth.users→profiles, ON CONFLICT DO NOTHING), apply-limit `pg_advisory_xact_lock` trigger (v59), `is_remote_compat` generated column (v32).
- Payments: Paystack init/verify/webhook; plans in `lib/paystack/plans.ts` + page/modal constants (duplication tracked in TECHNICAL_DEBT.md #6).

## SEO routes (must never change — none were touched)
`/jobs`, `/jobs/[id]`, 8 programmatic slices (`/jobs/{category,city,skill,country,industry,region,timezone,company}/[slug]`), `/companies/[slug]`, `/salary-guide/[slug]`, `/compare/[slug]`, `/resources/[slug]`, sharded sitemaps, robots, dynamic OG.

## Execution flow (webhook, the money path)
`Paystack POST → verifyPaystackSignature (timing-safe HMAC, length-checked) → insert into paystack_webhook_events (unique(event_type,paystack_id) → 23505 = duplicate, stop) → amount-vs-plan validation → plan grant via paystack_transactions reference-PK claim (23505 = already granted, stop) → ops alerts on anomalies`.
