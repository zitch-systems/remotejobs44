# RemoteJobs44 JobSpy on Vercel

This private Python adapter restores the HTTP service expected by the existing
Next.js importer. Both the web application and scraper stay on Vercel; Supabase
remains the database. The adapter does not write to the database.

## Vercel project

Deploy `services/jobspy` as the root directory of a separate Vercel project named
`remotejobs44-jobspy`, from `zitch-systems/remotejobs44`. Use the reviewed branch
for preview and `main` after merge. Select the **FastAPI** framework preset.
Vercel installs `requirements.txt` and loads `app.py`; no custom build/start
command is required. The directory includes Python 3.12 and function settings.

Set a random server-only `JOBSPY_API_KEY` (at least 32 ASCII characters) on this
project and the same key on the main RemoteJobs44 Vercel project. Never store
keys in Git, query strings, or client code. The service fails closed without it.
Set the main project's `JOBSPY_API_URL` to the actual deployed HTTPS service URL,
then redeploy the main project. Verify domain ownership and routing before
assuming the project gets the previously configured hostname.

Preview deployments may require Vercel deployment-protection authentication in
addition to the application key. Use the platform's authorized test access;
do not weaken application authentication to make a preview request succeed.

## Contract and limits

- `GET /healthz` reports process health. It does not verify job-board access.
- `GET /api/v1/search_jobs` requires `x-api-key` and accepts the existing
  client's CSV sites, search term, location, result limit, age, remote flag,
  job type, country, and JSON format parameters.
- Returns `{ "jobs": [...] }` with JSON-safe dates/nulls, annualized salaries,
  and only positively remote records for remote searches.
- Google receives its required search parameter. Indeed's incompatible age
  and remote filters are handled by filtering returned posting dates. Posting
  dates have calendar-day precision; missing dates cannot satisfy an age filter.
- A disposable child process is killed after 22 seconds, below the client's
  25-second attempt timeout. Function duration is 30 seconds.
- The lock permits one active scrape per function instance. Vercel can scale
  to multiple instances; it is not a distributed lock. The existing ingestion
  cron retains its Supabase lock. Restrict the key to trusted server callers.
- Invalid credentials return 401; bad input 422; a busy instance 429;
  scraper errors or malformed output 502; timeout 504. A failed board does
  not silently become a successful empty response. Test boards individually
  and use a verified `JOBSPY_SITES` subset if a board is unavailable.

## Verification

Install runtime requirements and `httpx==0.28.1`, then run from the repo root:

```sh
python -m unittest discover -s services/jobspy -p 'test_*.py' -v
```

The tests mock job boards and test actual local subprocess termination. They
cannot establish whether job boards accept requests from Vercel's IPs.

Before production cutover:

1. Confirm the Python deployment builds within Vercel's bundle limit and becomes
   ready; check runtime logs for import, subprocess, memory, or timeout failures.
2. Verify health 200, unkeyed search 401, and a small keyed search returning real
   remote jobs with usable application URLs within the client timeout.
3. Verify cold and warm searches. Confirm deployment protection allows the
   production server to call the service while API-key authentication remains on.
4. Set the main project's server environment URL/key and redeploy. Run the
   authenticated admin JobSpy ingest control, then inspect the cron result,
   source statuses, and actual newly inserted jobs in Supabase.
5. Verify the next 12:00 UTC scheduled run and the existing cron monitor.

Rollback by restoring the previous main-project URL/key and redeploying.
Keep the draft unmerged until Vercel deployment and live searches are verified.

References: [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi),
[Python runtime](https://vercel.com/docs/functions/runtimes/python),
[JobSpy parameters](https://github.com/speedyapply/JobSpy).
