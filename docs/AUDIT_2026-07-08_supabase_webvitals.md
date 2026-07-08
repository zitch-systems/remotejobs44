# RemoteJobs44 — Supabase + Web Vitals Audit

**Date:** 2026-07-08
**Scope:** Live Supabase database advisors (security + performance) for project
`gnyilmahiyddplsrrhoq` (remotejobs44), and a source-level review of the mobile
Core Web Vitals surfaced by Vercel Speed Insights (RES 64).
**Method:** Ran the Supabase security + performance advisors against production,
inspected `pg_policies` / `pg_roles` directly, applied fixes as migrations, and
re-ran the advisors to confirm. Read the highest-traffic routes and shared
layout for front-end performance anti-patterns.

---

## 1. Critical: missing migration applied

Production was on **migration v62** — `migration_v63_profile_cv_text.sql`
(merged in PR #165) had **never been applied**. The profile "Your CV text" save
shipped in that PR was therefore erroring in production on a non-existent
`profiles.cv_text` column.

**Fixed:** applied `v63_profile_cv_text` (adds `profiles.cv_text`). The profile
save now works end-to-end.

---

## 2. Supabase performance advisors — 117 → 11

Applied in `migration_v64_rls_advisor_cleanup.sql`.

| Lint | Before | After | Action |
|------|-------:|------:|--------|
| `auth_rls_initplan` (WARN) | 7 | **0** | Dropped 7 `auth.role()='service_role'` policies |
| `multiple_permissive_policies` (WARN) | 100 | **1** | Dropped redundant service-role policies; merged own+admin; scoped admin policies to `authenticated` |
| `unused_index` (INFO) | 10 | 10 | **Left intentionally** (see below) |

**The 7 service-role policies were pure dead weight.** Each was
`USING (auth.role() = 'service_role')` scoped `TO public`. Verified
`service_role` has `rolbypassrls = true`, so it never evaluates RLS at all —
these policies could only ever be true for a role that already bypasses them.
Their only effect was a per-row `auth.role()` call for anon/authenticated (the
initplan warning) and a second permissive policy the planner OR-ed in (the
multiple-permissive warning). Dropping them changes no access. `cron_locks` is
now service-role-only with no policy — the same intentional lockdown pattern as
`admin_2fa_codes` / `paystack_transactions`.

**own+admin consolidation.** `profiles` (SELECT/UPDATE) and `subscriptions`
(SELECT) each had two `TO public` permissive policies — "own row" + "admin sees
all". Merged each pair into one `TO authenticated` policy with the OR of both
predicates (`(select auth.uid()) = id OR is_admin((select auth.uid()))`). anon
never satisfied either branch, so scoping to `authenticated` is
behaviour-preserving. `auth.uid()` stays wrapped in a scalar subselect
(evaluated once per statement).

**admin policies scoped to `authenticated`.** The `is_admin(...)` "Admins can
manage" policies on `jobs`, `job_sources`, `ai_provider_configs` were `TO
public`. Scoped to `authenticated` (anon is never admin). Biggest win: the
high-volume **anonymous `jobs` read** now evaluates only the single public-read
policy instead of also running `is_admin()`.

**Residual (1):** `jobs` SELECT still has two permissive policies for
`authenticated` ("Jobs are publicly readable" + "Admins can manage jobs").
Fully clearing it means rewriting the `v62`-hardened public-visibility policy
and splitting the admin `ALL` policy into per-command write policies — high risk
on the most critical table for a marginal gain (`is_admin()` on a stable cached
uid is hoisted to a single per-query InitPlan eval, so the real per-row cost is
near zero). **Left deliberately.**

**Unused indexes (10, INFO) — left intentionally.** The DB is ~7 weeks old and
low-traffic; "unused" means "not exercised since stats reset", not "unnecessary".
Every one backs a rare-but-important path: FK integrity (`saved_jobs_user_id`,
`job_alerts_user_id`, `notifications_job_id`), the daily expire-cron
(`profiles_plan_expires_at`, `subs_expiry`, `jobs_expires_at`), the visibility
filter (`jobs_flagged`), the billing webhook (`subscriptions_paystack_sub_code`,
added in v62). Dropping them now would be premature. Revisit after real traffic.

---

## 3. Supabase security advisors

Applied in `migration_v64_rls_advisor_cleanup.sql`.

**Fixed:**
- `profiles_guard_privileged()` (the v62 BEFORE-UPDATE guard trigger) was
  `SECURITY DEFINER` and therefore callable by anon + authenticated via
  `/rest/v1/rpc/...`. Revoked `EXECUTE` from `anon, authenticated, public` —
  trigger functions don't need it to fire as triggers. (2 warnings cleared.)

**Left intentionally (documented, not bugs):**
- `rls_enabled_no_policy` on `admin_2fa_codes`, `paystack_transactions`,
  `cron_locks` (INFO) — the correct **service-role-only lockdown** pattern (RLS
  on, no policy ⇒ deny-all to end users, `service_role` bypasses).
- `extension_in_public` for `pg_trgm`, `pg_net` (WARN) — moving `pg_trgm` out of
  `public` would break the trigram search RPCs (`search_jobs_trgm`), which
  reference its operators. Not worth the breakage for a lint. Track separately.
- `is_admin(uuid)` executable by anon/authenticated (WARN) — required: the RLS
  policies call it, so the querying role needs `EXECUTE`. Minor info exposure
  (probe whether a *known* UUID is an admin); UUIDs are unguessable. Accepted.

---

## 4. Mobile Web Vitals (RES 64) — audit

Speed Insights (mobile, prod, last 7 days): FCP 2.64s, LCP 3.28s, **INP 728ms
(poor)**, CLS 0.04 (good), FID 25ms (good), TTFB 1.07s. Worst routes: `/` (77),
`/profile` (67), `/dashboard` (83).

**Finding: the front-end is already heavily optimized.** No low-hanging
front-end fix was found; the obvious wins are all already in place:
- `next/font` self-hosts Sora + DM Sans with `display: swap` (no
  fonts.googleapis round-trip).
- Homepage preloads the LCP hero AVIF with `fetchpriority=high`.
- The `/jobs` listing is a **server component** — filtering changes the URL and
  re-renders on the server, so the job list never re-renders client-side (the
  classic INP trap on a job board is already avoided).
- `member.css` is code-split out of the marketing critical path;
  `optimizePackageImports` is on for `lucide-react`; images are AVIF/WebP with a
  31-day cache TTL.
- Middleware already skips the Supabase auth round-trip on every non-`/admin`
  route (a prior TTFB fix); `CountUp` uses IntersectionObserver, respects
  `prefers-reduced-motion`, and only commits state when the integer changes
  "to lower INP".

**Interpretation.** With FID 25ms (good) but INP 728ms (poor), the cost is in
*processing/rendering during interactions*, not input delay — and against an
already-lean bundle, the dominant remaining factor is the **field profile**: the
audience is largely mobile users on lower-end Android + higher-latency mobile
networks (Nigeria/Africa), where a fixed amount of JS parses/executes slower and
origin RTT to `eu-west-1` inflates TTFB. These are not fixable by more static
optimization alone.

**Recommendations (need RUM attribution or a product/infra decision — not
applied here to avoid speculative regressions on a tuned app):**
1. **INP:** enable the Web-Vitals *attribution* build of the Speed Insights /
   `web-vitals` library to capture the specific `interactionTarget` + longest
   script for the p75 INP event. Fix the identified handler(s) rather than
   guessing. This is the highest-leverage next step.
2. **TTFB:** the dynamic `/jobs` + `/jobs/[id]` routes render in `eu-west-1`.
   For an African audience, evaluate a closer Vercel region or edge caching of
   the anon (auth-blind) variants; static/ISR routes already serve from the CDN.
3. **FCP/LCP:** audit which of the 8 loaded font weights (Sora 400/500/600/700/800,
   DM Sans 300/400/500) are actually used and drop the unused ones — each is a
   separate woff2 fetch competing with the LCP image on slow mobile. Verify
   against the design system before trimming.
4. Consider deferring genuinely non-critical always-on client islands (e.g.
   `PWAInstall`) out of the initial hydration path.

---

## Files
- `supabase/migration_v63_profile_cv_text.sql` (applied to prod; was missing)
- `supabase/migration_v64_rls_advisor_cleanup.sql` (new; applied to prod)
