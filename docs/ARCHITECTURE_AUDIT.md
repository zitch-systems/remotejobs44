# RemoteJobs44 — Architecture Audit

**Date:** 2026-07-01
**Scope:** Full read-only audit of the codebase's structure, state management, API design, search implementation, authentication, database layer, and testing/CI setup.
**Methodology:** 11 parallel read-only investigations, each grounded in specific file paths. A handful of claims were independently spot-checked against source before inclusion here; two claims from the raw findings were found to be incorrect and are corrected inline (see footnotes marked **[corrected]**).
**Out of scope:** Live database inspection. The Supabase project connected to this environment is not RemoteJobs44's production project, so the database section below is built entirely from the 59 SQL migrations committed to the repo, not a live schema dump.

---

## Executive Summary

RemoteJobs44 is a **well-engineered, production-grade codebase** for its scale. The team has clearly hit and fixed several real incidents (Supabase auth-server connection saturation, chunked-cookie random logouts, RLS policy recursion, Paystack webhook race conditions) and left the fixes documented in code comments — a strong signal of an application that has survived real production traffic, not a greenfield prototype. Architecture is organized by feature in `components/` and by domain in `lib/`, with no monolithic "god" utils dumping ground. Search is genuinely server-side (full-text + trigram fallback, faceted, cached, bookmarkable). Auth is mature and defensive. The main gaps are: a handful of oversized single-purpose files in the admin/ingestion surface, inconsistent API response shapes, `zod` installed but never used for validation, and a testing pipeline that runs unit tests in CI but not the Playwright e2e suite that already exists.

**Nothing found here rises to "rewrite it" — this is a codebase to extend and harden incrementally, not replace.**

---

## 1. Folder & Component Architecture

- `app/` follows Next.js App Router conventions with one consistent route group, `app/(member)/`, wrapping every signed-in page in `MemberShell` — applied uniformly, not ad hoc.
- `components/` is organized by feature (`home/`, `jobs/`, `member/`, `auth/`, `layout/`, `legal/`, `ui/`), not by technical layer. `lib/` is organized by domain (`auth/`, `supabase/`, `paystack/`, `jobs/`, `member/`, `email/`, `admin/`). No `shared.js`/`utils-dump` anti-pattern exists — `lib/utils.ts` is ~120 lines of genuinely shared formatting helpers (`cn`, `formatSalary`), not a dumping ground.
- **Oversized files** (candidates for splitting, not correctness bugs):
  - `lib/ats-engine.ts` — 1,741 lines. Mixes redirect/SSRF validation, ATS-platform detection re-exports, and 5-platform fetch orchestration.
  - `app/admin/company-import/page.tsx` — 1,012 lines. Single client component: concurrent worker pool, localStorage persistence, detection logic, 10k+ row table rendering.
  - `lib/ingest-pipeline.ts` — 839 lines. RSS/feed ingestion, dedup, job insertion, WPJM enrichment in one file with no sub-phase boundaries.
  - Several `app/admin/*` pages (300–1,000+ lines: `ai-discovery`, `users`, `companies`) mix table rendering, filtering, bulk actions, and API calls with no extracted sub-components.
  - `app/(member)/profile/page.tsx` (560 lines) and `app/(member)/dashboard/page.tsx` (540 lines) each combine several unrelated UI sections in one component.
- **Duplication:** Pricing plan constants (`PLANS`) are independently defined in `app/pricing/page.tsx`, `components/jobs/PaywallModal.tsx`, and the Paystack Supabase Edge Functions — no single source of truth. `lib/resources.ts` (392 lines) is a data file (article catalogue) living alongside code modules. `lib/mock-data.ts` (247 lines) is dev/test fixture data living in `lib/` rather than a test directory.
- **Verdict:** Sound architecture, feature-oriented, no critical anti-patterns. The debt is scale-driven (files that grew past a comfortable size), not structural.

## 2. State Management & Data Flow

- Three focused Zustand v5 stores (`lib/store.ts`, 241 lines): `useAuthStore`, `useJobsStore`, `useUIStore`, each with `skipHydration: true` and manual rehydration to avoid SSR/client mismatches. Components use narrow primitive selectors (e.g. `useAuthStore(s => s.user?.plan)`) rather than destructuring whole objects — this avoids the classic "50 job cards re-render on every store write" problem.
- `components/providers/AuthSyncProvider.tsx` (328 lines) is a single, well-commented orchestrator for auth validation, profile fetch, saved-jobs hydration, and applications backfill — a genuine single source of truth rather than scattered `useEffect`s.
- Server Components fetch data directly (Supabase + `unstable_cache`); interactive islands (Apply, Save, Share) are the only client components on data-heavy pages like job listing/detail — a clean, deliberate server/client boundary.
- Minor real gaps: a 5-second profile-fetch timeout with no retry can leave a stale plan from localStorage in place on slow networks; saved-job state can drift for a few minutes across two open tabs/devices (self-heals on next navigation, by design).

## 3. API & Backend Design

- Business logic is consistently extracted into `lib/` (`lib/admin/auth.ts`, `lib/rate-limit.ts`, `lib/paystack/`, `lib/ai/provider.ts`) rather than inlined in route handlers.
- Structured logging (`lib/log.ts`) is used uniformly across 42+ routes with a consistent `{ ts, level, event, ...fields }` shape and fire-and-forget alerting.
- Input validation exists but is **hand-rolled per field** (type/length/enum checks, regex UUID validation, LIKE-wildcard escaping, XML-tag escaping for LLM prompt injection defense) rather than schema-based. `zod` is a `package.json` dependency but is imported in **zero** files under `app/api` or `lib` — confirmed by direct grep, not inferred.
- Response shapes are inconsistent across endpoints (some include `retryAt`, others don't; pagination field names differ between `/api/jobs` and `/api/admin/*`). Not a bug, but it forces bespoke client-side handling per endpoint.
- Cache invalidation (`safeRevalidate()`) is defined once inside `app/api/jobs/route.ts` rather than as a shared `lib/cache.ts` utility, despite being a cross-cutting concern.
- No Next.js Server Actions are used anywhere — all mutations go through `/api/*` routes with a clean client → `lib/api.ts` → route handler boundary. This is a deliberate, consistent choice, not an oversight.

## 4. Search & Filtering Implementation

This is one of the strongest parts of the codebase:

- **Fully server-side.** `app/jobs/page.tsx` runs `queryJobsListing()` on every request; the client `JobsFiltersBar` only ever updates the URL via `router.push()`, which triggers a fresh server render. There is no client-side filtering of a pre-fetched array anywhere in the search path.
- **Full-text search with fuzzy fallback.** A Postgres `search_jobs()` RPC (relevance-ranked via `ts_rank`) is the primary path; when it returns zero matches for a 3+ character query, a trigram similarity RPC (`search_jobs_trgm`) catches typos.
- **Seven faceted filters** (category, type, level, posted-within, timezone, region/country, salary — salary intentionally hidden pending better data coverage, not a bug).
- **Bookmarkable/shareable URLs** — all filter state lives in the query string, read via `useSearchParams()`.
- **Smart caching** — `queryJobsListing()` is wrapped in `unstable_cache()` with a 60-second TTL, keyed by filter params *and* the requester's plan (so free/paid users never share a cached response), with `revalidateTag('jobs')` on admin mutations.
- **A generated column** (`is_remote_compat`, migration v32) replaces a runtime regex-OR chain for the "remote" filter — Postgres maintains it automatically on write, backed by a partial index, cutting query time from ~203ms to ~36ms per the migration's own commit notes.
- Minor gaps: no facet-count badges (e.g. "Engineering (42)") before a user clicks a filter, and a maintenance hazard where the `REGION_TERMS` map must be kept manually in sync with the UI's country list (silent fallback to substring match on mismatch, not a crash).

## 5. Authentication Architecture

- Supabase auth integration is unusually mature for the codebase's size, with three real production incidents documented and fixed in code comments:
  1. **Auth-server connection saturation** — middleware originally called `getUser()` on every request (including RSC prefetches), starving Supabase's Auth server of its connection pool and causing 2–14s login stalls. Fixed by scoping `getUser()` to `/admin/*` only; `/dashboard` and other member routes gate on **cookie presence**, deferring full validation to the client.
  2. **Chunked-cookie random logouts** — long OAuth JWTs split into `sb-{ref}-auth-token.0`, `.1`, etc.; the old `endsWith('-auth-token')` check missed the chunked variants. Fixed via a shared, unit-tested `hasSupabaseAuthCookie()` regex helper used by both middleware and the client provider.
  3. **Spurious SIGNED_OUT events** — Supabase can emit `SIGNED_OUT` during a token-refresh race; a 2.5s grace period + cookie re-check before actually logging the user out prevents false logouts.
- RBAC: a hardcoded admin-email allowlist (env var, server-only) plus a DB `role` column, an independent `suspended` kill-switch, and optional email-OTP 2FA (default off, enabled only after mailbox delivery is confirmed) for admin accounts. `/admin/*` routes get a full server-side `getUser()` check at the middleware layer (justified — low-traffic, high-sensitivity route); member routes trade early rejection for lower Auth-server load, matching pattern #1 above.
- Real open item: RLS policy correctness itself is **assumed, not verified** by this audit (no live DB access). The application-layer checks are defense-in-depth on top of RLS, not a replacement for it.

## 6. Database Schema & Data Layer (from repo migrations, not live inspection)

59 SQL migrations are committed to the repo. Domain model:

- **Core:** `profiles` (role, plan, plan_expires_at), `jobs` (with `apply_url` uniqueness restored after a v25 migration collapsed ~203k duplicate rows), `job_sources`.
- **Engagement:** `saved_jobs`, `applications` (status enum, `steps` jsonb, unique `(user_id, job_id)`), `job_alerts`, `notifications`.
- **Payments:** `subscriptions` (Paystack codes, billing period), `paystack_webhook_events` (dedup by `(event_type, paystack_id)` composite key — refined in v57 after discovering non-globally-unique numeric IDs across event types), `paystack_transactions` (reference-based ledger preventing double-grant).
- **Growth:** `referrals`, `referral_clicks`, `agent_commissions` (affiliate program).
- **Ops:** `site_settings`, `admin_2fa_codes`, `cron_locks` (distributed task coordination).
- RLS is enabled repo-wide; a documented fix (`supabase/fix_rls_recursion.sql`) replaced admin-check policies with a `SECURITY DEFINER is_admin()` function to eliminate a recursive-policy self-join.
- A free-tier/day-pass apply-limit is enforced **twice** — once via an atomic `pg_advisory_xact_lock` trigger (v59, closes a count-then-insert race) and once in the API route (an older, coarser check). The migration's own comment says "the web route owns the daily-pass cap," implying the trigger is meant as a backstop — but which one is the actual source of truth isn't documented anywhere. This is worth resolving explicitly (see `TECHNICAL_DEBT.md`).

## 7. Testing & CI/CD

- ~4,300 lines of unit tests (Vitest) exist, concentrated on business-critical logic: free-trial gating, Paystack HMAC signature verification, plan resolution, cookie-chunk detection. These are genuinely good tests (edge cases, security-relevant timing-safe comparisons tested explicitly).
- Playwright is fully configured (`playwright.config.ts`) with e2e specs for auth, job-detail, and pricing flows — but `.github/workflows/ci.yml` only runs `npm run test:unit`. The Playwright suite is **not** part of the CI gate. Verified directly: every PR check observed in this session was named `type-check · lint · unit tests · build`, with no separate Playwright job.
- Coverage is scoped to `lib/**` only (`vitest.config.ts`); none of the ~150 files under `app/**` (React components/pages) have unit or component-level tests.
- Zero automated tests exist for any of the 54 API route handlers, including the payment-critical `/api/paystack/webhook` and the gating logic in `/api/applications`.

---

## Overall Assessment

| Dimension | Health |
|---|---|
| Architecture / folder structure | Good — feature-oriented, no critical anti-patterns |
| State management | Good — clean store design, minor edge cases |
| API design | Good — solid separation, needs schema validation + response consistency |
| Search | Excellent |
| Authentication | Excellent — mature, battle-tested, well-documented |
| Database (repo-visible) | Good — solid RLS + idempotency; one dual-enforcement ambiguity |
| Testing/CI | Needs attention — e2e suite is built but not gated in CI |

See `TECHNICAL_DEBT.md` for the consolidated, prioritized task list across all dimensions, and `PERFORMANCE_REPORT.md`, `SEO_REPORT.md`, `SECURITY_REPORT.md`, and `ACCESSIBILITY_AUDIT.md` for the deep dives on those specific areas.
