# Hardening Phase 1 — RLS Audit
**Constraint:** this environment has no access to the live RemoteJobs44 Supabase project (verified: the connected account contains two unrelated projects). Everything below derives from the 60 committed migrations; run `scripts/rls-verify.sql` against production to confirm parity.

## Coverage (grep of `alter table … enable row level security` across supabase/*.sql)
RLS is enabled in migrations for ALL 20 public tables: profiles, jobs, job_sources, saved_jobs, applications, job_alerts, notifications, subscriptions, paystack_webhook_events, paystack_transactions, referrals, referral_clicks, agent_commissions, device_push_tokens, mobile_devices, site_settings, admin_actions, admin_2fa_codes, cron_locks, ai_provider_configs.

## Patterns
- Owner access via `auth.uid() = user_id` (applications, saved_jobs, job_alerts, notifications, subscriptions, device tokens).
- Admin access via `is_admin()` SECURITY DEFINER (fix_rls_recursion.sql) — no recursive profile self-joins, no email-based policies.
- Server-only tables (webhook events, transactions, 2fa codes, cron locks, provider configs): RLS enabled with no client policies — deny-all to anon/authenticated; service role bypasses by design.
- Column-level: `apply_url`/`apply_email` SELECT revoked from anon/authenticated (v16) — the paywall is enforced in the DB, not just the app.

## Residual risk (unchanged from SECURITY_REPORT.md)
Migration files ≠ live database. If any table was created or altered via the dashboard without RLS, the repo can't see it. **Action for operator:** run `scripts/rls-verify.sql` (read-only) in the Supabase SQL editor; every row must show `rowsecurity = true` and every sensitive table at least one policy. No additive migration is needed unless that query surfaces a gap.
