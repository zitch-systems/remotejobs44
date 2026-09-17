# RemoteJobs44 JobSpy service

Private Python adapter for the existing `lib/jobspy.ts` client. This service does
not write to Supabase: the existing Vercel cron owns filtering, deduplication,
database writes, source status, and alerts.

## Deployment configuration

Create one native Python Render web service from this repository after confirming
the intended Render workspace and checking that no replacement already exists.

| Setting | Value |
| --- | --- |
| Name | `remotejobs44-jobspy` |
| Repository | `https://github.com/zitch-systems/remotejobs44` |
| Branch | reviewed branch for staging; `main` after merge |
| Runtime | Python |
| Build command (repository root) | `pip install -r services/jobspy/requirements.txt` |
| Start command (repository root) | `uvicorn app:app --app-dir services/jobspy --host 0.0.0.0 --port $PORT --workers 1 --no-access-log` |
| Health check | `/healthz` |
| `PYTHON_VERSION` | `3.12.14` |
| `JOBSPY_API_KEY` | random secret, at least 32 ASCII characters |

Use the free plan for staging unless a paid plan is explicitly approved. Free
services sleep after 15 minutes without traffic; Render documents a roughly
one-minute cold start, which exceeds the Next.js client's 25-second timeout. Do not declare production recovery based on a warm health
check. Verify a cold-start search too, or approve an always-on instance before
switching production. Do not add artificial keep-alive traffic.

Use the same secret in Vercel's server-only `JOBSPY_API_KEY`; set
`JOBSPY_API_URL` to the service's actual HTTPS base URL. Set secrets directly in
the platform's secret environment settings, never in Git, browser code, URLs,
or logs. Redeploy Vercel after the configuration change. The exposed Vercel
plugin may not support environment-variable writes; that step must use an
authorized supported interface.

## API and operational behavior

- `GET /healthz`: unprotected process health; startup fails if the key is absent
  or too short. Health alone does not prove job-board availability.
- `GET /api/v1/search_jobs`: requires `x-api-key`; accepts the existing client's
  CSV `site_name`, `search_term`, `location`, `results_wanted`, `hours_old`,
  `is_remote`, `job_type`, `country_indeed`, and `format=json` parameters.
- Returns `{ "jobs": [...] }` with JSON-safe dates/nulls. Only positively remote
  records are returned for remote searches. Salaries are annualized by JobSpy.
- Google receives `google_search_term`. Indeed's incompatible age/remote
  filters are handled by applying the age cutoff to returned posting dates.
  Job boards expose date-only values, so cutoff precision is one calendar day.
- A disposable subprocess is killed after 22 seconds, below the client's
  timeout. Only one request scrapes at a time (`--workers 1` is required).
- Bad credentials: 401; invalid parameters: 422; concurrent search: 429;
  scraper failure: 502; timeout: 504. Board errors are deliberately failures,
  not successful empty results. If one board repeatedly fails, use a tested
  `JOBSPY_SITES` subset in Vercel and investigate that board separately.
- Health probes remain responsive while scraping. No queue, database, public
  documentation endpoint, user-provided proxy, or arbitrary URL input is exposed.

## Tests

Install runtime requirements plus `httpx==0.28.1`, then run from the repo root:

```sh
python -m unittest discover -s services/jobspy -p 'test_*.py' -v
```

Tests use local subprocess fixtures and mocked board responses. They do not
demonstrate that job boards currently accept traffic from a Render IP.

## Required release checks

1. Deploy with the API key set; verify `/healthz` returns 200 and an unkeyed
   search returns 401.
2. Run a small authenticated search from a trusted server. Confirm actual
   remote jobs, usable apply URLs, and completion within the client timeout.
3. Check memory use and logs on the chosen instance. Test after inactivity.
4. Set Vercel's URL/key, redeploy, then run the authenticated admin JobSpy
   ingestion control. Verify the cron/source result and newly inserted jobs
   in Supabase, not just a successful HTTP response.
5. Verify the next scheduled 12:00 UTC run and existing cron monitor.

Rollback: restore the previous Vercel URL/key and redeploy; suspend the new
service if it is not needed. Keep production configuration unchanged until
the replacement passes the release checks.

References: [JobSpy API parameters](https://github.com/speedyapply/JobSpy),
[Render free service limits](https://render.com/docs/free).
