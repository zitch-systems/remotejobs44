# RemoteJobs44 — Technical Debt Register & Prioritized Task List

**Date:** 2026-07-01
**Companion to:** `ARCHITECTURE_AUDIT.md`, `PERFORMANCE_REPORT.md`, `SEO_REPORT.md`, `SECURITY_REPORT.md`

This is the consolidated backlog across all five audits — the single prioritized list requested as a final deliverable. Severity reflects **actual verified risk**, not raw agent output: two claims from the initial audit pass (a "missing" skip-to-content link and a "missing" revalidate export) were checked against source and found to be incorrect; they do not appear below. A third claim (moving `puppeteer-core` to `devDependencies`) was checked and found to be actively risky advice — it's used at runtime by `lib/ats-engine.ts`, `lib/ats-detect.ts`, and `lib/render-js.ts`, so it correctly belongs in `dependencies` and should **not** be moved.

---

## God Files / Oversized Modules

| File | Lines | Note |
|---|---|---|
| `lib/ats-engine.ts` | 1,741 | Mixes SSRF/redirect validation, ATS-platform detection, and 5-platform fetch orchestration |
| `app/admin/company-import/page.tsx` | 1,012 | Worker pool + localStorage persistence + detection logic + 10k-row table, all in one client component |
| `lib/ingest-pipeline.ts` | 839 | RSS ingestion, dedup, insertion, WPJM enrichment with no sub-phase boundaries |
| `app/admin/ai-discovery/page.tsx` | 937 | Table + filtering + bulk actions + API calls, no extracted sub-components |
| `app/(member)/profile/page.tsx` | 560 | CV upload + email verification + profile form + CV review in one file |
| `app/(member)/dashboard/page.tsx` | 540 | Stats + recommendations + alerts summary + savings display |
| `app/admin/companies/page.tsx` | 411 | Same admin-table pattern as above |
| `app/admin/users/page.tsx` | 353 | Same admin-table pattern as above |

**None of these mix unrelated *domains*** (e.g. auth logic living inside a job-search file) — they're single-domain files that grew past a comfortable size. Splitting them is a real improvement but carries real regression risk in proportion to how business-critical the file is: `ats-engine.ts` and `ingest-pipeline.ts` sit directly in the revenue-critical job-ingestion pipeline (a silent regression here means new jobs quietly stop appearing on the site), while the `app/admin/*` pages are internal tooling with a much smaller blast radius if something breaks.

## Duplication

- **Pricing plan constants** (`PLANS`) are defined independently in `app/pricing/page.tsx`, `components/jobs/PaywallModal.tsx`, and the Paystack Supabase Edge Functions. A drift between these (e.g. a price change applied to one but not the others) would misquote a price to users or mismatch what the Edge Function actually charges. **This is payment-adjacent — treat as medium risk, not a drop-in refactor.**
- **`REGION_TERMS`** (`lib/jobs/region-terms.ts`) must be manually kept in sync with the `REGIONS`/`COUNTRIES` UI arrays in `components/jobs/JobsFiltersBar.tsx`; a mismatch silently falls back to substring matching rather than failing loudly.

## Inconsistencies

- API response shapes vary across endpoints (different pagination field names, inconsistent inclusion of metadata like `retryAt`) — not a bug, but it forces bespoke client-side handling per endpoint.
- `zod` is a declared dependency and is imported in **zero** files (verified by direct grep across `app/api` and `lib`) — all request validation is hand-rolled per field instead.
- The free-tier/day-pass apply-limit is enforced in *two* places (a v59 atomic DB trigger and an older API-route check) with no documentation of which one is authoritative.
- `lib/resources.ts` (392 lines, an article-catalogue data file) and `lib/mock-data.ts` (247 lines, test fixtures) live alongside actual code modules in `lib/` rather than in a data/ or test-fixtures location.

---

## Prioritized Task List

### Critical
1. **Resolve the dual apply-limit enforcement** (DB trigger vs. API route) — document which is authoritative, add a concurrency test that proves the cap holds under simultaneous requests either way. *(Database)*
2. **Add automated tests for the Paystack webhook & `/api/applications` gating logic** — these are the two most financially/legally consequential code paths in the app and currently have zero test coverage. *(Testing)*

### High
3. **Wire the existing Playwright e2e suite into CI** — it's fully configured and has real specs (auth, job-detail, pricing) that currently never run on a PR. Add a step to `.github/workflows/ci.yml` after the build step. *(Testing)*
4. **Introduce `zod` schemas at API boundaries**, starting with `/api/jobs`, `/api/paystack/*`, and `/api/applications` — replace hand-rolled field validation with a single schema per endpoint in a new `lib/api-schemas.ts`. *(API design)*
5. **Split `lib/ats-engine.ts` and `lib/ingest-pipeline.ts`** into phase-scoped modules (fetch / detect / dedupe / insert) — but only with full test coverage added *first*, given this is the revenue-critical ingestion path. Treat as its own dedicated, carefully-verified PR, not a drive-by refactor. *(Architecture)*
6. **Centralize pricing plan constants** into a single `lib/paystack/plans.ts`, imported by the pricing page, the paywall modal, and referenced by the Edge Functions — eliminates the 3-way drift risk. Payment-adjacent: needs careful review before merge. *(Architecture)*

### Medium
7. **Extract sub-components from the largest `app/admin/*` pages** (`ai-discovery`, `users`, `companies`, `company-import`) into a shared `components/admin/` (AdminTable, AdminFilters, BulkActionBar). Internal tooling — lower risk than the ingestion-pipeline split above. *(Architecture)*
8. **Standardize API response shapes** — define one canonical error/pagination shape and apply it across endpoints going forward. *(API design)*
9. **Extract `safeRevalidate()` into a shared `lib/cache.ts`** rather than defining it once inside `app/api/jobs/route.ts`. *(API design)*
10. **Add facet-count badges to job search filters** (e.g. "Engineering (42)") so users can see filter impact before clicking. *(Search)*
11. **Add a build/test-time check that `REGION_TERMS` covers every UI region/country option**, so a new country added to the filter UI can't silently degrade to substring matching. *(Search)*
12. **Move `lib/mock-data.ts` and `lib/resources.ts`** out of `lib/` proper (`test/fixtures/`, `data/`) so `lib/` stays code-only. *(Architecture)*

### Low
13. Add a retry to the 5-second profile-fetch timeout in `AuthSyncProvider` so a slow network doesn't leave a stale plan from localStorage in place.
14. Document the saved-jobs cross-device reconciliation behavior (self-heals on next nav, not instant) somewhere discoverable.
15. Document the admin-suspension kill-switch (`profiles.suspended`) in a runbook rather than relying on institutional knowledge.

---

Cross-reference: performance-, SEO-, and security-specific action items are prioritized separately within their own reports to keep this list from ballooning into a duplicate of all four documents; only architecture/testing/general debt items are repeated here.
