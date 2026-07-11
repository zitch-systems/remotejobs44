# JobSpy integration

JobSpy pulls remote roles from **LinkedIn, Indeed, ZipRecruiter and Google Jobs**
into RemoteJobs44 — both automatically (daily cron) and on demand (admin console).

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

- **Platform / daily ingest** — `lib/ingest-pipeline.ts` adds one JobSpy source
  per default query (`JOBSPY_DEFAULT_QUERIES` in `lib/jobspy.ts`), mirroring the
  SerpApi source. The 06:00 UTC cron and the admin **Run Ingest Now** button both
  fetch, scam-screen, dedupe on `apply_url`, and upsert into `public.jobs`. Jobs
  then appear in the public `/jobs` listing like every other source.
- **Admin console** — **Admin → JobSpy** (`app/admin/jobspy/page.tsx`) runs a live
  search via `POST /api/admin/jobspy/search`, **lists every job JobSpy returns**,
  and imports the selected ones through `/api/ats/save` (deduped, audited). Pause
  or inspect the automatic JobSpy queries from **Admin → Sources** — they record
  runs into `job_sources` like the other feeds.

## Files

| File | Role |
|---|---|
| `lib/jobspy.ts` | API client, normaliser, config helpers |
| `lib/ingest-pipeline.ts` | Registers JobSpy in the daily ingest `SOURCES` |
| `app/api/admin/jobspy/route.ts` | Config/status for the console |
| `app/api/admin/jobspy/search/route.ts` | On-demand search (preview, no writes) |
| `app/admin/jobspy/page.tsx` | Admin JobSpy console |
