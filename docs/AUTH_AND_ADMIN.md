# Auth & Admin — how it works, and how not to break it

This codifies the authentication / admin model and the invariants behind a run
of session bugs (PRs #27–#29). Read this before touching `middleware.ts`,
`lib/supabase/*`, `components/providers/AuthSyncProvider.tsx`, the `/admin`
layout, or anything role-related.

## Reaching the admin area — the private entrance

The admin area has been **removed from the public `/admin` URL**. `/admin` (and
every `/admin/*` page) answers a plain **404** to anyone who has not opened a
private, env-configured "knock" link first. The portal still lives at `/admin`
internally — only the *entrance* changed.

How it works (`lib/admin/portal.ts` + `middleware.ts`):

1. An operator opens their private link: `https://<host>/<ADMIN_PORTAL_SLUG>`.
2. Middleware mints a signed, http-only access cookie (`rj_portal`, a
   SHA-256 of the slug — not the slug itself) and redirects to `/admin`.
3. Middleware lets `/admin*` through **only** when that cookie is valid; every
   other request to `/admin*` is rewritten to the site 404. The normal auth
   gating (session → `/login`, non-admin → `/dashboard`) runs after the cookie
   check, unchanged.

The slug is a **server-only** env var (`ADMIN_PORTAL_SLUG`, no `NEXT_PUBLIC_`
prefix), referenced only in middleware/server code, so it never ships in a
browser bundle. Rotate it by changing the env var and redeploying. **This is
obscurity in front of the real gate** — `requireAdmin()` (session + role + 2FA)
still guards every `/api/admin/*` route regardless of the cookie, so a leaked
slug grants visibility of the login screen, never access.

Notes:
- Tell your admins to bookmark the `/<slug>` link — that is now the way in. The
  cookie lasts ~180 days, so once knocked, `/admin` (and the admin-only "Admin
  Panel" header shortcut) keep working in that browser until it expires.
- `/api/admin/*` is **not** cookie-gated (the middleware matcher excludes
  `/api/*`); those routes are protected by `requireAdmin()` as before.

## Admin access — two paths

An account is an admin if **either** is true (see `resolveRole` /
`isHardcodedAdmin` in `lib/auth/redirect.ts` + `lib/admin-emails.ts`):

1. **Hardcoded email** — listed in the `HARDCODED_ADMIN_EMAILS` env var
   (comma-separated, server-only) or the compile-time `FALLBACK_ADMINS`
   (`admin@remotejobs44.com`). Works without any DB row; survives a profile
   fetch failing.
2. **DB role** — `public.profiles.role = 'admin'`. A "DB-only admin" — works
   only once the profile row is read.

Every server admin gate goes through `requireAdmin()` (`lib/admin/auth.ts`),
which honours both paths **and** a `suspended` kill-switch (a suspended admin
is denied even if hardcoded).

## Granting / revoking admin — safely

```sql
-- grant
update public.profiles set role = 'admin' where lower(email) = 'person@example.com';
-- revoke
update public.profiles set role = 'user'  where lower(email) = 'person@example.com';
```

⚠️ **Always keep a working backup admin.** A DB-only admin who is demoted with
no other admin (no usable hardcoded email, no other `role='admin'` row) locks
everyone out of `/admin`. Before demoting your last DB admin, confirm a
`HARDCODED_ADMIN_EMAILS` entry exists and that account can log in. Check current
admins first:

```sql
select email, role from public.profiles where role = 'admin';
```

## A regular user can NOT make themselves admin

Defence in depth — verified in the security review:

- **Column grants:** `authenticated` may UPDATE only `(name, updated_at)` on
  `profiles`. `role` / `plan` / `suspended` / `plan_expires_at` are not
  grantable, so `update profiles set role='admin'` is denied at the column
  layer even though the `own_update` RLS policy matches the row.
- **Privileged writes** (`plan`, `role`, subscriptions) happen only via the
  service-role client inside admin/webhook routes.
- Client-side `role`/`plan` in Zustand is display-only; the server re-checks
  via `requireAdmin()` on every admin route and RLS on every table.

## Audit trail

`migration_v31.sql` adds `trg_audit_profile_role_change`: every role change is
written to `admin_actions` (surfaced at **/admin → Audit Log**) as
`profile.role_change` / `profile.role_set_on_insert`, with `old_role`,
`new_role`, `target_email`, and the actor (`auth.uid()`, null for
service-role / SQL-editor edits). This is the backstop that catches the
out-of-band grants `recordAdminAction()` can't see.

## Auth / session resilience invariants — DO NOT regress

These each cost a production incident. Keep them:

1. **Never drop the user while an auth cookie is present.** `syncAuth` and the
   `SIGNED_OUT` handler must guard `setUser(null)` behind
   `documentHasSupabaseAuthCookie()`. A momentary failure to read a freshly-set
   cookie must not surface as "session expired". (`AuthSyncProvider.tsx`)
2. **Recover, don't dead-end.** When a cookie is present but no user resolves,
   actively `supabase.auth.refreshSession()` and only show a recoverable
   "Verifying… / Sign in again" state — never a bare logout.
3. **Middleware is scoped to page routes, not `/api/*`.** API routes
   authenticate themselves; running `getUser()` on every API call floods
   Supabase Auth and tips requests into transient failures. (`middleware.ts`
   matcher)
4. **`getAuthedUserSafe` de-dupes concurrent callers** (one in-flight promise)
   — several components validate auth on the same mount. (`lib/supabase/client.ts`)
5. **Single canonical host.** Supabase auth cookies are host-only; `www` →
   apex redirect (`next.config.js`) keeps one cookie jar. Don't add a
   conflicting platform redirect in the opposite direction.
6. **The `/admin` gate only bounces to `/dashboard` on a POSITIVELY-read
   non-admin profile** — never on a failed/empty profile fetch. A DB-only
   admin whose fetch times out is still an admin; treating "no profile" as
   "not admin" is the #28 bug. (`app/admin/layout.tsx`; rule pinned by the
   `resolveRole` tests in `lib/auth/redirect.test.ts`.)

## Setup checklist

- [ ] `ADMIN_PORTAL_SLUG` set in Vercel (Production) to your own private,
      hard-to-guess path segment — this is the entrance to the admin area
      (`https://remotejobs44.com/<slug>`). If unset, a public placeholder
      default is used and the entrance is guessable. Generate with
      `openssl rand -hex 8`.
- [ ] `HARDCODED_ADMIN_EMAILS` set in Vercel (Production) to at least one admin
      you control — your break-glass account.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set for
      Production (a missing URL makes the browser look for the wrong cookie).
- [ ] One canonical host enforced (apex), `www` → apex redirect live.
- [ ] Supabase → Authentication → Attack Protection → **Leaked password
      protection** enabled.
- [ ] `migration_v31.sql` applied (role-change audit trigger).
- [ ] At least one working admin exists (`select email,role from profiles where role='admin'`).
