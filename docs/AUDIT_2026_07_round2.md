# RemoteJobs44 — Backend / Jobs / Admin Deep Audit (July 2026, round 2)

Focused follow-up covering the backend/API layer, Supabase (schema + live DB),
the public job list, and the admin job search/posting flows. Baseline stayed
green throughout (TypeScript clean, 493 unit tests, ESLint 0 errors, build
passing). The live database was inspected directly via the Supabase MCP.

## Live Supabase findings (verified against the running DB)

- **Listing query is healthy:** the no-query `/jobs` listing uses
  `jobs_feed_order_idx` (index scan, ~0.2 ms for the row slice); the
  `count: 'exact'` is ~80 ms warm over 52k active rows — acceptable and already
  a documented tradeoff.
- **Search is healthy:** `search_jobs` is ~40 ms warm (an 832 ms first hit was
  cold cache), `search_jobs_count` ~21 ms. The RPC applies the **same**
  `is_active` / not-flagged / not-expired visibility filter as the listing path
  and RLS — no inconsistency.
- **Data integrity is good:** all 107k jobs have distinct `apply_url`s (the
  dedupe unique index is doing its job), 0 expired rows leak, 36 flagged, 8
  rows with an empty company (trivial).
- **Observations, not defects (left as-is):** `company_id` is 100% NULL across
  the table (the column/FK is unused); ~3,130 (title, company) groups have
  duplicates by design (dedupe keys on `apply_url`, not title); two tiny
  indexes (`jobs_flagged_idx`, `jobs_expires_at_idx`) are unused but cost
  nothing to keep.

## Fixes applied

### Admin job management (the headline fix)
- **Admin job search only searched the 50 loaded rows; no pagination.** The
  page fetched one page and filtered client-side, so with 107k jobs an admin
  could only ever find/feature/delete the 50 most-recent. Rewired to
  **server-side search** (debounced → `/api/jobs?q=`) with **prev/next
  pagination**, and a real range indicator. (`app/admin/jobs/page.tsx`)
- **A DB failure silently rendered mock jobs.** `jobsApi.getJobs` falls back to
  `MOCK_JOBS` on any error, and acting on a mock row (`id 'j1'`) fires a doomed
  DELETE against a uuid column. The admin page now fetches `/api/jobs` directly
  and shows a distinct **"Couldn't load jobs — retry"** state instead.
- **Delete / feature-toggle had no error handling.** A failed delete left the
  row's button disabled forever with no feedback. Both now use try/catch/finally
  with error toasts; the feature toggle also guards against rapid re-clicks and
  trusts the server's returned value.
- **Accessibility:** icon-only row actions and the search input gained
  `aria-label`s (and `aria-pressed` on the feature toggle).

### Jobs API write-path correctness (`app/api/jobs/route.ts`)
- **PATCH to an unknown/deleted id returned 500** (via `.single()`); now
  `.maybeSingle()` → clean **404**.
- **PATCH didn't map the unique-violation to 409** like POST does; editing an
  apply URL to a duplicate now returns **409** instead of a generic 500.
- **Input-validation gaps that reached PostgREST as 500s** are now clean
  **400s**: non-array `skills` (text[] → 22P02), unparseable `posted`/`expires`
  dates (22007), and out-of-int4 / fractional `salaryMin`/`salaryMax` (22003).
  Added cheap gates for `currency`/`timezone`/`logo` length and
  `applyEmail`/`sourceUrl` format.
- **Empty/unknown-only PATCH body** (`updates = {}`) now returns **400** instead
  of a PostgREST error or a misleading zero-column "success".

### Billing correctness
- **Second subscription-expiry race** — the *daily* cron
  (`app/api/cron/daily/route.ts`) still did SELECT-then-blind-UPDATE (the
  pattern already fixed in `expire-daily` last round), so a Paystack renewal
  landing mid-sweep could downgrade a just-paid user. Converted both branches to
  compare-and-set (`UPDATE … WHERE <expiry predicate> RETURNING`).

### Ingestion robustness
- **Hardcoded-source ingest loop had no time budget** — a couple of hanging
  feeds (20 s timeout × 2 retries each) could run the loop past the 60 s
  function limit and get the pipeline killed mid-run (lock held to TTL,
  downstream expiry/freshness/alerts unrun). Added a 40 s wall-clock cap that
  skips remaining sources (they run first next cycle); it only bites when feeds
  hang. (`lib/ingest-pipeline.ts`)
- **ATS refresh bypassed the scam screen** the aggregator ingest applies. Added
  `detectScam` to the ATS `toJobRow`, setting `flagged`/`flagged_reason` on
  every row (uniform keys to avoid the NULL-fill hazard). (`lib/ats-refresh.ts`)

### Public job list + filters
- **`/jobs?page=99999` showed "No jobs found"** instead of the last page. The
  server component now clamps and redirects an out-of-range page to the last
  real page. (`app/jobs/page.tsx`)
- **Sort control was cosmetic while searching** — the FTS RPC always orders by
  relevance and ignores `sort`, so "Newest first" did nothing. With a query
  active the control now offers only "Most relevant". (`components/jobs/JobsFiltersBar.tsx`)
- **Region/Timezone filters had no removable chips**; added them.
- **Dead `companySize` param** — sent by `getJobs` but never read server-side;
  removed from the client and the `SearchFilters` type. (`lib/api.ts`, `lib/types.ts`)

## Left as-is (documented, lower priority)
- `release_cron_lock` deletes unconditionally (no owner token) — mitigated in
  practice by the ingest time-budget fix above keeping runs well under the
  10-min TTL.
- `company_id` is an unused column; ~3,130 title/company duplicate groups are a
  by-design consequence of apply_url dedup — both are data-model observations,
  not defects.

## Verification
- `tsc --noEmit`: clean
- `vitest run`: 493/493 pass
- `eslint .`: 0 errors
- `next build`: passes
