# JobSpy integration

JobSpy pulls remote roles from **LinkedIn, Indeed, ZipRecruiter and Google Jobs**
into RemoteJobs44 — both automatically (its own daily cron) and on demand (admin
console). Every day it works through a broad query set covering all job
categories, screens the results, and posts them to the platform, skipping both
exact duplicates and any role already listed from another source.

## Why an API service

[`python-jobspy`](https://github.com/speedyapply/JobSpy) is a Python library and
can't run inside this Next.js / serverless app. So the app talks to a **JobSpy
API service** over HTTP — the small FastAPI wrapper around `python-jobspy` that
exposes the scraper as JSON. You deploy that service yourself (a container is the
usual shape) and point the app at it.

The app treats JobSpy like any other JSON source: it's keyed on an env var, so an
un-configured deploy simply skips it — nothing breaks.

## Setup

1. Deploy a JobSpy API service that exposes `GET /api/v1/search_jobs` and returns
   JSON. The endpoint should accept the standard JobSpy query params
   (`site_name`, `search_term`, `location`, `results_wanted`, `hours_old`,
   `is_remote`, `country_indeed`).
2. Set the environment variables (see `.env.example`):

   | Variable | Required | Notes |
   |---|---|---|
   | `JOBSPY_API_URL` | ✅ | Base URL (e.g. `https://jobspy.example.com`) or the full search endpoint. |
   | `JOBSPY_API_KEY` | – | Sent as the `x-api-key` header when set. |
   | `JOBSPY_SITES` | – | Comma list of boards. Default `indeed,linkedin,zip_recruiter,google`. |
   | `JOBSPY_COUNTRY` | – | Country hint Indeed requires. Default `usa`. |

3. Redeploy. JobSpy activates automatically.

> Glassdoor is intentionally excluded and is filtered out of any `JOBSPY_SITES`
> override — it must not be referenced product-wide.

## How it's wired

- **Daily scrape (its own cron)** — `/api/cron/jobspy` runs at **12:00 UTC** and
  calls `runJobSpyIngest()` in `lib/ingest-pipeline.ts`. JobSpy has a dedicated
  cron (not the 06:00 feed ingest) because the scraper is slow and used to get
  starved at the tail of that run's shared budget. Each day it works through
  `JOBSPY_DEFAULT_QUERIES` (`lib/jobspy.ts`) — one broad query per job category —
  rotating the starting query by day and staying inside a time budget, so the
  whole set is covered over a couple of days even if one run is cut short.
- **Posting + dedup** — for each query it fetches, scam-screens, then applies
  **two dedup layers** before insert:
  1. `apply_url` (exact) — collapses in-batch repeats; the unique index +
     `ON CONFLICT DO NOTHING` stop cross-run duplicates.
  2. **Cross-source identity** — drops any row whose `(title, company, location)`
     already exists as an active job **from any source**, so JobSpy never
     re-lists a role a feed like Remotive or an ATS board already carries. This
     uses the same key as the nightly `dedupe_jobs()` RPC (migration_v30), which
     stays on as a safety net for casing variants the pre-filter misses.
  Kept jobs upsert into `public.jobs` and appear in `/jobs` like any other source.
- **Admin console** — **Admin → JobSpy** (`app/admin/jobspy/page.tsx`) runs a live
  search via `POST /api/admin/jobspy/search`, **lists every job JobSpy returns**,
  and imports the selected ones through `/api/ats/save` (deduped, audited).
- **Run now** — the admin **Run Ingest Now** button also triggers a short JobSpy
  top-up alongside the feed + ATS refresh. Pause or inspect the automatic JobSpy
  queries from **Admin → Sources** — they record runs into `job_sources` like the
  other feeds.

## Files

| File | Role |
|---|---|
| `lib/jobspy.ts` | API client, normaliser, config helpers, default query set |
| `lib/ingest-pipeline.ts` | `runJobSpyIngest()` + cross-source platform dedup |
| `lib/dedupe-jobs.ts` | `jobIdentityKey` / `filterByIdentity` (shared with the nightly RPC's key) |
| `app/api/cron/jobspy/route.ts` | Dedicated daily JobSpy cron (12:00 UTC) |
| `app/api/admin/jobspy/route.ts` | Config/status for the console |
| `app/api/admin/jobspy/search/route.ts` | On-demand search (preview, no writes) |
| `app/admin/jobspy/page.tsx` | Admin JobSpy console |
