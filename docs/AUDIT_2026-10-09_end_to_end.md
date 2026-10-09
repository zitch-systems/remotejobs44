# RemoteJobs44 — End-to-End Audit (2026-10-09)

Scope: the job pipeline from source to user — scheduled ingestion (feeds, JobSpy,
ATS boards), locking, freshness/expiry, dedupe, the public listing and apply paths,
payments/entitlement touchpoints, public-route abuse controls, dependencies, CI
health, and doc/config drift. Baseline is `main` @ `61cb741`.

Not covered (no access from this session): the live Supabase project (the Supabase
MCP failed to connect), Vercel cron logs, live RLS/advisor state, and the Expo
mobile app's tests and build. Findings below come from source, migrations, and a
local build/test run only.

## Baseline (before and after the changes in this PR)

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | 0 errors, 47 warnings (25 `set-state-in-effect`, 15 `exhaustive-deps`, 6 other React-hooks rules, 1 `no-location-assign-relative-destination`) |
| `vitest run` | 72 files, 781/781 tests pass |
| `next build` | succeeds |
| `npm audit --omit=dev` | **3 high → 0** (fixed here) |

## Fixed in this PR

1. **Production dependency advisories (high).** `next` 16.3.6 → 16.4.0 (cache
   poisoning in SSG/ISR, SSRF in image optimisation, metadata-route info
   disclosure), `sharp` 0.35.4 → 0.35.5 (librsvg CVE), `source-map-js` 1.2.1 → 1.2.2
   (event-loop DoS). All inside the existing semver ranges; lockfile-only change.
   Typecheck, 781 tests and a production build re-run clean afterwards.
2. **Stale JobSpy schedule docs.** `vercel.json` runs `/api/cron/jobspy` hourly and
   `/api/cron/ats-refresh` every 15 minutes (changed deliberately in #232), but
   `docs/jobspy.md`, `services/jobspy/README.md` and the route's header comment
   still said "daily at 12:00 UTC" with day-rotated queries. An operator verifying
   "the next 12:00 UTC run" would be looking for a run that never happens. Docs
   now match the code (longest-waiting query first, hourly).
3. **`RESEND_WEBHOOK_SECRET` undocumented.** `/api/webhooks/resend` fails every
   delivery with 401 when it is unset, so bounce/complaint suppression silently
   stops working on a fresh environment. Added to `.env.example`.
4. **Misleading comment** in `app/api/companies/route.ts` claimed 5-minute edge
   caching; the route is `force-dynamic` and Pro-gated per requester.

## Verified sound

- **Cron auth** (`lib/cron-auth.ts`): fails closed (503) on a missing/short secret,
  constant-time compare, length check before `timingSafeEqual`. Every
  `/api/cron/*` route uses it.
- **Cron locks**: `acquire_cron_lock` / `release_owned_cron_lock` are
  ownership-fenced (a stale runner cannot release a newer holder's lock), validate
  arguments, `security definer` with empty `search_path`, execute revoked from
  `public/anon/authenticated` and granted only to `service_role`. Ingest, JobSpy and
  ATS refresh each hold their own lock with a 10-minute TTL and release in `finally`.
- **Failure signalling**: the daily, ATS and JobSpy crons return 500/502/503 when a
  task fails or the budget is exhausted, so failures appear in Vercel's cron log
  rather than as a green 200.
- **Ingest writes**: upsert on `apply_url` with `ignoreDuplicates`, chunked with
  per-row fallback and one retry on `57014/40001/40P01`; failures counted and
  surfaced rather than swallowed.
- **Visibility**: listing, apply-channel, and alert queries all apply the same
  `is_active` + `notExpired()` + `NOT_FLAGGED` filters.
- **Alert sends** honour `email_prefs.job_alerts`, `suspended`, and bounced/complained
  addresses, and carry one-click unsubscribe headers.
- **Route guards**: a scan for API routes with no recognised guard produced only
  `admin/promote` (a disabled stub returning 410), `paystack/verify` (verifies the
  reference against Paystack, validates its character set, fulfilment is idempotent),
  and intentionally public routes (`contact`, `yc`, `r/[code]`, sitemap, auth
  callback). `contact` and `yc` are rate-limited.
- **XSS surface**: every `dangerouslySetInnerHTML` is JSON-LD with `<` escaped, or a
  static style block. The service-role client is imported only in server modules.

## Open findings (not changed — need an owner decision)

**Resolved (follow-up) — daily cron alert loop had no time budget and was not
idempotent.**
`app/api/cron/daily/route.ts` now stops *starting* alert sends 85s into its 120s
window, counts the unsent ones, and fails the run (`failures: ["alerts_deferred"]`,
HTTP 500, `alerts.deferred` in the body) instead of being killed silently. Alerts are
read least-recently-sent first so a truncated run cannot starve the same users every
day. A new nullable `job_alerts.last_sent_at` (migration
`20261009120000_job_alerts_last_sent.sql`) is stamped after each successful send, and a
user mailed within the last 20h is skipped (`alerts.already_sent`), so a retried or
re-run invocation no longer re-mails everyone. **The migration is applied by hand**
(see the earlier `migration_v63` incident); until it is applied the cron logs
`cron.daily.alerts_last_sent_missing` and runs as before, without the guard.
Remaining gap: a run that defers users still only retries them on the next scheduled
run (alerts use a 24h window), so deferred users can miss that day's mail — the 500 is
the signal to act on.

**Low — freshness sweep throughput.**
Batches of 5 rows, capped at 2,000 rows per phase per run, once a day. Fine in
steady state, but a backlog (e.g. after an ATS outage lets many rows pass the 60-day
cutoff together) takes several days to drain; `backlogRemaining` is logged but not
alerted on.

**Low — `/api/companies`** has no rate limit. It is Pro-gated and the RPC is cheap
(~150 ms per earlier audits), so the abuse ceiling is a signed-in Pro user.

**Low — dev-tooling advisories remain** (10: `tailwindcss` 3.x glob dependencies,
`eslint-config-next`, `@tailwindcss/typography`). None ship to runtime. npm's
suggested fixes are major jumps (Tailwind 4) or nonsensical downgrades
(`eslint-config-next@14`), so they were left alone; revisit with a planned Tailwind 4
migration.

**Low — product-copy drift.** The README spec says to keep all copy worldwide and not
reintroduce region-specific framing, yet `app/blog/how-to-find-remote-jobs-in-nigeria`
and `app/resources/*africa*` pages exist. They may be intentional SEO content; flagging
only so the spec and the site agree.

**Hygiene — 47 ESLint warnings** (breakdown in the baseline table; e.g.
`components/ui/PWAInstall.tsx:27` for `set-state-in-effect`). No errors; the
`exhaustive-deps` ones are worth a look because they can be real stale-closure bugs.

## Suggested follow-ups, in order

1. Apply `20261009120000_job_alerts_last_sent.sql` in production and alert on
   `alerts_deferred` in the daily cron's failures.
2. Alert on `backlogRemaining: true` for several consecutive daily runs.
3. Re-run this audit against the live project: Supabase security/performance
   advisors, `scripts/rls-verify.sql`, and the last week of Vercel cron results.
4. Run the mobile test suite and Android smoke test (not run here).
