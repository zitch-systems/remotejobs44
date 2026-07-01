# Hardening Phase 1 — Admin Security Audit

## Phase-3 compatibility pattern — ALREADY IMPLEMENTED
The prompt's target (`isDatabaseAdmin() || isHardcodedAdmin()`) is exactly what `lib/admin/auth.ts` does today: `role === 'admin'` (DB, `profiles.role`) **OR** `isHardcodedAdmin(email)` (`lib/admin-emails.ts`, server-only env `HARDCODED_ADMIN_EMAILS`). The suspended kill-switch (`profiles.suspended`) overrides both. `/api/admin/promote` is disabled (410) — roles are granted only in the Supabase dashboard.

## Decision: NO new `admins` / `admin_audit_logs` tables
Creating the prompt's `admins` and `admin_audit_logs` tables was **rejected deliberately**:
- `profiles.role` + `profiles.suspended` already model admin RBAC; a second `admins` table = two sources of truth for the same fact → drift = the exact class of bug hardening should remove.
- `admin_actions` (existing) already is the admin audit log: actor, action, resource, old-value capture (row-before-delete), timestamps — written by `recordAdminAction()` across the admin routes.
This follows the prompt's own prime directive (“when uncertain, do not duplicate — additive ≠ redundant”). If granular `permissions jsonb` becomes a real requirement, add a **column** to `profiles` (additive) rather than a parallel table.

## Authorization by uid, not email
DB policies authorize via `auth.uid()` / `is_admin(uuid)` (SECURITY DEFINER, `supabase/fix_rls_recursion.sql`, callable check documented in migration_v53). The only email-based check is the deliberate, server-side hardcoded-admin fast path — an app-layer bootstrap mechanism, not a DB policy; RLS never trusts an email. **No change needed.**

## MFA (Phase 7) — one real gap, FIXED
`admin_2fa_codes` (v58): hashed codes bound to user id ✅ · expiry enforced (`expires_at > now`) ✅ · replay prevention (`consumed_at` filter + set-on-success) ✅ · attempt limits (per-code MAX + per-admin rate limit) ✅ · **cleanup ❌ — dead rows (consumed/expired) were never deleted.**
**Fix shipped:** `app/api/admin/2fa/send/route.ts` now purges the requesting admin's consumed/expired rows on each new code issue (fire-and-forget; rows are inert by definition, so no auth outcome can change). See FIX_SUMMARY.md.
