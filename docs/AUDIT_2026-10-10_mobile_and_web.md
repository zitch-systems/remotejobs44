# RemoteJobs44 — Mobile + Web End-to-End Audit (2026-10-10)

Scope: the Expo/React Native app (`mobile/`), the Next.js web app (pages, API routes,
middleware, auth, admin, SEO, CI), the Supabase edge functions, and the live backends the
two share (Supabase project, Vercel project, EAS). Baseline is `main` @ `113effd`, i.e. after
the 2026-10-09 audit and the alert-loop fix.

This is the follow-up to [`AUDIT_2026-10-09_end_to_end.md`](./AUDIT_2026-10-09_end_to_end.md),
which was blind to the mobile app and the live backends. This one is not.

## How it was done

| Area | What was run |
|---|---|
| Web | `tsc`, `eslint`, full `vitest` suite, `node --test tests/*.test.mjs` (PGlite DB tests), production build against the CI Supabase fixture, the full Playwright suite (chromium) against that build, black-box probes of headers/pages/routes, and a read of the middleware, admin/auth modules and the public, member, payment, AI, ATS/RSS, unsubscribe and cron-auth API routes (the many `/api/admin/*` routes were checked for their guard pattern, not line by line) |
| Mobile | `tsc`, full `jest` suite, release-preflight test, read of auth/session/OAuth/deep-link/payment/entitlement/push/profile code, `app.json` / `eas.json` / CI / Codemagic / build docs |
| Live Supabase (read-only) | RLS policies and column/table grants, security + performance advisors, `pg_cron` jobs, `pg_stat_statements`, table/index statistics, deployed edge-function source vs. repo |
| Live Vercel (read-only, via the Vercel connector) | Runtime errors and warnings for the production deployment of this project only |
| Live EAS (read-only) | Build list and Observe version data for this app's project id only |

Secrets: no credential values appear in this report. One plaintext secret was found in the
database (finding D2); its value was deliberately not copied anywhere.

## Result at a glance

Fixed in this PR (each is backed by a test that fails without the fix and passes with it; F3 is
the repair of the tests themselves — details under "Fixed in this PR"):

| # | Sev | Area | Defect |
|---|---|---|---|
| F1 | Medium | Web | `/jobs/<non-uuid>` hit Postgres, which rejects it; the lookup deliberately throws on query errors, so scanner probes produced 500s (seen in production logs) |
| F2 | Low | Web | `/sitemap.xml` returned 404 (the sharded sitemap index lives at `/sitemap-index.xml`) |
| F3 | Medium | CI | Four e2e tests were silently excluded from CI with `--grep-invert`; all four were broken tests, not flakes |
| F4 | Low | Web a11y | Login error banner was not announced to screen readers |
| F5 | Medium | Mobile | Feed, job detail, Saved and Applications each fetched twice on every mount (supabase-js `INITIAL_SESSION` replay treated as a session change) |
| F6 | Medium | Mobile | Saving an already-saved job failed RLS (`42501`) and the bookmark rolled back |
| F7 | Low | Mobile | `apply_email` validation allowed `?`, `&`, `,`, `;`, `%` straight into a `mailto:` URL |
| F8 | Low | Mobile | One failed OAuth-settings probe hid LinkedIn sign-in until the app was restarted |

Needs an owner decision (nothing below was changed) — the ones to read first:

| # | Sev | Area | Finding |
|---|---|---|---|
| D1 | **High** | Mobile + DB | CV upload, avatar, skills/target role/headline and profile details **cannot be saved from the app**: the database only lets signed-in users update `profiles.name` and `updated_at` |
| D2 | Medium | DB | A bearer secret is stored in plaintext inside a `pg_cron` job; treat it as exposed and rotate |
| D3 | Medium | DB / data | Nightly `archive-stale-jobs` has not archived anything since 2026-10-02, and its rule fights the ATS keep-alive |
| D4 | Medium | DB / perf | Listing queries hit the 8 s statement timeout; ingest writes exhaust their retry budget |
| D5 | Medium | Mobile / product | A free user who tracks an application can't reach the apply link in the app (the web gives it to them) |
| D6 | Medium | Mobile | Android App Links / iOS universal links can't verify — the `.well-known` files don't exist |
| D7 | Medium | Mobile / release | No EAS build since 2026-06-18, every listed APK has expired, no production/iOS build, no crash reporting configured |

Everything else is in "Other findings", ordered by severity.

## Baseline

| Check | Before | After |
|---|---|---|
| Web `tsc --noEmit` | clean | clean |
| Web `eslint` on changed files | 0 errors | 0 errors (3 warnings, all in untouched lines of `app/login/page.tsx`; repo-wide baseline is still the ~47 React-hooks warnings from the previous audit) |
| Web `vitest run` | 72 files, 787 tests | 72 files, 797 tests |
| Web `node --test tests/*.test.mjs` | 52 pass | 52 pass |
| Web e2e, the exact CI command | 72 ran; 4 of 76 were excluded by `--grep-invert` (all 4 fail when run) | 78 / 78 pass in CI mode (`CI=true`, 2 retries allowed, none used); `--grep-invert` removed |
| Web e2e, every spec file (chromium) | 119 / 124 pass (5 failing: the 4 above + 1 in `navigation.spec.ts`) | 126 / 126 pass |
| Mobile `tsc --noEmit` | clean | clean |
| Mobile `jest` | 22 suites, 117 tests | 23 suites, 133 tests |
| Mobile release-preflight test | 5 pass | 5 pass |

## Fixed in this PR

Each fix below was proven the same way: write the test first, watch it fail on the old code,
then watch it pass.

### F1 — Malformed job ids caused 500s (web, `lib/jobs/job-detail.ts`)

`jobs.id` is a `uuid`. `/jobs/<anything else>` reached Postgres as `id = 'abc'`, which fails
with `22P02 invalid input syntax for type uuid`. `fetchJobRow` throws on query errors on
purpose (so a transient outage is never cached as "job doesn't exist" for five minutes), so
each probe became a 500 — and each distinct probe also minted its own `unstable_cache` key and
`job-${id}` tag.

Production evidence (Vercel runtime errors, route `/jobs/[id]`, 2026-10-09): `job-detail fetch
failed: invalid input syntax for type uuid: "<real job id>'"` and `…"<real job id>xh3test"` —
SQL-injection probes against real job URLs. They were harmless (parameterised queries) but they
filled the error log and surfaced as failures.

Fix: `getJobDetailRow` and `getExpiredJobMeta` answer "no such job" for any non-uuid id before
touching the cache or the database. Same behaviour the sibling `/api/jobs` route already had.
Tests (`lib/jobs/job-detail-db.test.ts`): nine malformed ids (empty, `abc`, SQL fragments, path
traversal, 32 hex digits with no dashes, a non-hex digit, one digit too long, a trailing space)
never reach `unstable_cache` or Supabase; a well-formed uuid in either case still does. 9 of the
12 tests fail on the old implementation.

### F2 — `/sitemap.xml` was a 404 (web, `next.config.js`)

`app/sitemap.ts` is sharded with `generateSitemaps()`, so Next serves shards at
`/sitemap/<id>.xml` and reserves `/sitemap.xml`; the index is a route handler at
`/sitemap-index.xml`, which `robots.txt` advertises. `/sitemap.xml` is still the first path
most crawlers and SEO tools probe by convention. Added a rewrite from `/sitemap.xml` to the
index (nothing is shadowed — no page or public file owns that path). Also corrected two code
comments that pointed at `app/sitemap.xml/route.ts`, which does not exist.

### F3 — Four e2e tests were disabled in CI, and all four were broken (`tests/e2e/*`, `ci.yml`)

CI ran the suite with `--grep-invert "wrong credentials|validates empty fields|plan
comparison|sitemap.xml is accessible"`. None was a flake:

| Test | Why it failed | Fix |
|---|---|---|
| `login form validates empty fields`, `login with wrong credentials shows error` | The button is labelled "Log in"; the tests looked for `/sign in/i` (and slept 4 s, then matched a stale message regex) | Select `^log in$`; assert on the `role="alert"` banner with a retrying matcher |
| `plan comparison shows free vs paid differences` | Read `<main>.textContent()` once; the pricing grid renders after a Suspense fallback, so it saw `""` | Retrying `toContainText` |
| `sitemap.xml is accessible` | Expected a `urlset` at `/sitemap.xml` (see F2) and a hard-coded `remotejobs44` host, which is `localhost:3000` in CI | Three tests: the index lists shards, `/sitemap.xml` serves the same index, shard 0 is a `urlset` |

Also fixed the one failing test in a spec CI doesn't run: `navigation.spec.ts › no console
errors on homepage` failed only because `next start` 404s Vercel's `/_vercel/insights` and
`/_vercel/speed-insights` scripts (Chromium reports two errors for each; the filter now looks at
both the message location and its text). `--grep-invert` is removed from `ci.yml`.

### F4 — Login errors weren't announced (web a11y, `app/login/page.tsx`)

The error banner was a plain `<div>`. Added `role="alert"`. (Register and reset-password report
errors through the toast container, which is already `role="status"` / `aria-live`.)

### F5 — Mobile data hooks fetched everything twice (`mobile/src/lib/session-change.ts`)

supabase-js replays the current session to every new `onAuthStateChange` subscriber as an
`INITIAL_SESSION` event. Five hooks subscribed (`useJobs`, `useRecommendedJobs`, `useJob`, and
the Saved and Applications screens), each also loads on mount, and each treated the replay as a
session change: it bumped its request token (discarding the request it had just started), cleared
its list, and fetched again. Net effect: two `/api/jobs` calls per cold start and per job-detail
open, a flash of empty/loading state, and a possible wipe of the cached feed page painted a
moment earlier.

Fix: a small `onSessionChange(listener)` helper that ignores `INITIAL_SESSION` and forwards every
real change (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`, …); the five hooks use
it. Token-refresh behaviour is unchanged on purpose (the existing design re-resolves plan-aware
fields on refresh). 7 new tests; removing the filter fails the replay test. The wiring inside the
five hooks is not covered by a rendering test — the mobile project has no React test renderer and
its policy is pure-logic tests only — so that part rests on the type check and a read of the diff.

### F6 — Re-saving a saved job failed and rolled back (`mobile/src/lib/user-state.ts`)

`setSavedRemote` used the default upsert (`ON CONFLICT … DO UPDATE`). `saved_jobs` has only
select/insert/delete policies — **no UPDATE policy** (checked on the live project) — so a repeat
save of an existing row is rejected with `42501`. The store then rolled back the optimistic
bookmark even though the row existed. This happens whenever the job was saved on the web or another
device, or an earlier attempt's response was lost.

Reproduced offline in PGlite with the live policy set: first save OK; second save with
merge-duplicates → `ERROR 42501 new row violates row-level security policy (USING expression)`;
second save with `ignoreDuplicates` (`ON CONFLICT DO NOTHING`) → OK. Fix: `ignoreDuplicates: true`.
3 new tests.

### F7 — `mailto:` injection via `apply_email` (`mobile/src/lib/apply.ts`)

`job/[id].tsx` builds `mailto:${email}?subject=…`. The validator accepted anything without `@` or
whitespace, so scraped data like `hr@x.com?bcc=…`, `…&cc=…`, `a@x.com,b@y.com`, or `%2C`-encoded
variants would add recipients or headers to the user's outgoing application. The pattern is now a
conservative single-address subset (`[A-Za-z0-9._+-]+@(labels.)+tld`); a rare exotic address falls
back to the in-app apply flow. 2 new tests (the injection test fails on the old pattern). The same
loose pattern exists on the web — see D16.

### F8 — A failed OAuth-settings probe was remembered forever (`mobile/src/lib/oauth-availability.ts`)

`cached ??= fetch(...).catch(() => SAFE_DEFAULTS)` cached the fallback, so an offline cold start (or
one 5xx/timeout) left LinkedIn hidden until the app was killed. Only a successful read is cached
now; a failure answers that call with the safe defaults and the next call retries. 4 new tests (2
fail on the old code).

## Needs an owner decision

### D1 — High — The app cannot save a CV, avatar, skills, target role, headline, bio, links or experience

Live `information_schema.column_privileges`: `authenticated` may `UPDATE` only
`profiles.name` and `profiles.updated_at` (granted in `supabase/migration_v9.sql:20`).
`mobile/src/lib/profile.ts` updates `cv_url` (line 37), `avatar_url` (81), `skills/target_role/
headline` (183) and `bio/links/experience` (204) directly with the user's JWT, so Postgres rejects
all of them (`42501`). Only the display name works. Worse, `uploadCv` and `uploadAvatar` upload the
file to Storage *first*, and nothing deletes it when the profile update then fails, so failed
attempts leave orphaned objects.

The web does this through server routes: `/api/profile` (PATCH, `name/target_role/cv_text` only)
and `/api/cv` (Pro-only, email-confirmed, rate-limited, magic-byte validated). Those routes are
cookie-only; only `/api/jobs` accepts a bearer token.

Options: (a) accept bearer tokens in `/api/profile` and `/api/cv` (and extend `/api/profile` to
the missing fields), keeping validation server-side; (b) grant column-level `UPDATE` on the
harmless fields (`skills, target_role, headline, bio, links, experience, avatar_url`) and keep
`cv_url` behind the server route. Either way, the direct-to-Storage CV upload skips the web
route's Pro/validation gate and should move behind the server too. I recommend (a) for `cv_url`
and (b) for the rest, but that is a product/security call.

### D2 — Medium — A bearer secret sits in plaintext in a `pg_cron` job

`cron.job` row #2 (the push-notification trigger) embeds its authorization header, including the
`PUSH_CRON_SECRET` value, in the job `command`. Anyone who can read `cron.job` or
`cron.job_run_details` can read it, and it is also in any backup. It was printed in a tool result
while this audit ran, so treat it as exposed. Rotate `PUSH_CRON_SECRET` (Vercel + the job) and move
the value into Supabase Vault so the job reads it at run time.

### D3 — Medium — `archive-stale-jobs` is stalled and conflicts with ATS keep-alive

Live state: `last_archive_run` = 2026-10-02 03:00 UTC, 0 archived in the last 24 h. 100,324 jobs are
active; 41,597 of them are older than 45 days, and 40,407 of *those* were seen at the source
recently. 37,598 active rows still carry an `archived_at` stamp from an earlier archive — the ATS
refresh reactivates jobs but never clears it. `pg_stat_statements` shows `archive_stale_jobs`
averaging ~17 s per call over 77 calls, so the unbatched update of tens of thousands of rows is
the likely reason it stopped completing.

The rule (`migration_v47.sql`) archives on `posted_at` age; the ATS keep-alive (`last_seen_at`)
says the same posting is still live. Pick one source of truth: key the sweep off `last_seen_at`,
batch it, and clear `archived_at` when a job is reactivated — or unschedule it.

### D4 — Medium — Database read and write pressure

* Reads: the top statements by cumulative time are PostgREST listing queries on `jobs` using an
  exact count — e.g. the category listing: 10,167 calls, mean 2.69 s, max ≈ 8.0 s, 27,356 s in total;
  the title/skills search: 8,974 calls, mean 1.5 s, max 7.97 s. Maxima cluster at 8 s because that is
  the effective `statement_timeout` for the API roles (the code comments say 60 s). `count: 'exact'`
  re-scans the filtered set on every page.
* Writes: `jobs` carries 26 indexes (4 GIN) and only ~3.9 % of updates are HOT, so every
  `last_seen_at` bump rewrites index entries. Production logs on 2026-10-09/10 show
  `jobspy.query_failed … freshness write retry budget exhausted` and the daily cron's
  `ingest_source_failures` (RemoteOK).
* Advisors: 13 unused indexes; `multiple_permissive_policies` on `jobs`.

Suggested order: estimated/cached counts for listings; drop the unused/redundant indexes; move
`last_seen_at` to a narrow side table (restores HOT updates); then revisit the 8 s ceiling.

### D5 — Medium — Free users can't reach the apply link in the app

Web free users who track an application can fetch the off-site channel via
`/api/applications?channel=<jobId>`; the app can't, because that route is cookie-only. In the app
`fetchApplyChannel` calls the entitled-only RPC `job_apply_channel`, so free users get the in-app
"track" flow but never the link. Same remedy as D1(a): accept the bearer token on that route.

### D6 — Medium — App Links / universal links can't verify

`app.json` declares `applinks:remotejobs44.com` (iOS) and an `autoVerify` intent filter for
`https://remotejobs44.com/jobs*` (Android), but the site serves 404 for
`/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`. Without them, job
links open in the browser (or show a chooser) instead of the app. Needs the Android signing-cert
SHA-256 and the Apple Team ID — owner-supplied values, so not guessed here.

### D7 — Medium — Release readiness

* EAS shows 10 builds, newest 2026-06-18, all Android, profile `preview`, distribution `INTERNAL`
  (APKs). Every artifact's expiry date (2026-06-30 to 2026-07-02) has passed. There is no
  `production` (AAB) or iOS build, and nothing newer than the June commits.
* EAS Observe has no versions for either platform in 90 days (the app doesn't integrate it — so
  this is not evidence of zero users).
* Crash reporting (`@sentry/react-native`) is a no-op unless `EXPO_PUBLIC_SENTRY_DSN` is set at
  build time; no committed build config sets it (it may exist as an EAS secret — not checked).
* The Play Console crash API isn't linked to the Expo account (no service-account key).

Net: whatever users have today predates a lot of this repo's fixes, and a new release would have no
crash visibility unless the DSN is set. Check `preview` signing too (debug keystore) before any
store submission.

## Other findings

| # | Sev | Area | Finding and recommendation |
|---|---|---|---|
| D8 | Medium | Mobile / compliance | In-app Paystack checkout sells digital subscriptions. Apple (3.1.1) and Google Play billing rules generally require their IAP for digital goods consumed in the app. Needs a store-policy review before submission |
| D9 | Medium | Web SEO | `/pricing` is client-rendered: the server HTML has an empty `<main>` (only the `<title>`/meta and JSON-LD mention the plans; the prices and feature list are absent). `robots.txt` explicitly welcomes GPTBot, ClaudeBot and PerplexityBot, which don't run JS. Server-render the plan grid (the job-detail page already does this deliberately) |
| D10 | Medium | Web | `lib/rate-limit.ts` is an in-memory `Map`, so on serverless every warm instance has its own counters. The AI cost caps (1/day free, 20/day paid, 30/day/IP) and the `/api/jobs` anti-scrape cap are best-effort only. The file already says to move to Redis; a Postgres-backed counter would avoid a new service |
| D11 | Medium | Mobile | The three Supabase AI edge functions (`ai-cv-review`, `ai-cover-letter`, `ai-interview-prep`) are Pro-gated server-side but have no per-user rate limit (the web equivalents cap at 20/day); a Pro account can run them unbounded |
| D12 | Medium | Privacy | `delete-account` removes table rows and the auth user but not Storage objects: `cvs/<uid>/…` (CVs, personal data) and `avatars/<uid>/…` remain after deletion. Nothing cascades (the only trigger on `auth.users` is the signup one) and `storage.protect_delete` blocks SQL deletes, so the function must list and `remove()` the objects through the Storage API. Play and App Store account-deletion rules expect the data to go |
| D13 | Low | Web SEO | Missing job ids return HTTP 200 + `noindex` + "Job Not Found" (a soft 404), even for bots. Cause: `loading.tsx` streams the shell before `notFound()` runs. A true 404 means checking existence in the layout, which blocks the first byte on a cold cache — a trade-off, so left alone. Closed jobs correctly serve a noindex "Position Closed" page |
| D14 | Low | DB | Advisors: leaked-password protection is off; `pg_trgm` and `pg_net` live in `public`; `is_admin` and `job_apply_channel` are `SECURITY DEFINER` and callable by signed-in users (by design — confirm). Default Supabase grants also give `anon`/`authenticated` table-level `TRUNCATE`, `REFERENCES`, `TRIGGER` (and `UPDATE`/`INSERT`/`DELETE` to `anon`) on user tables such as `saved_jobs`; RLS protects rows and PostgREST exposes no `TRUNCATE`, but revoking the unneeded ones is cheap defence in depth |
| D15 | Low | Web admin | The hard-coded-admin path (`HARDCODED_ADMIN_EMAILS`) doesn't require `email_confirmed_at`, and `/api/rss` + `/api/ats` (admin-only) buffer the whole response before the 5 MB check and validate-then-refetch DNS (rebinding window). Confirm `ADMIN_MFA_REQUIRED` is on in production |
| D16 | Low | Web | The web builds `mailto:${applyEmail}` from the same loose pattern fixed in F7 (`lib/apply-link.ts:112` strips `?…` but not `&`, `,`, `%`; `JobActionsCard` / `JobCard` don't validate). Share one strict validator |
| D17 | Low | Mobile | Password-recovery deep links are accepted from any inbound link. A "recovery request" marker would block a crafted link from signing the user into another account, but it would also break "requested on the web, opened on the phone", so it needs a product decision (a confirm screen is the alternative) |
| D18 | Low | Web SEO | `/settings` is neither disallowed in `robots.txt` nor `noindex` (every other member route is one or the other); `/interview-prep` is intentionally indexable |
| D19 | Low | CI | Seven spec files aren't in the CI command (`accessibility`, `blog`, `homepage`, `job-detail`, `navigation`, `performance`, `redirect`); they pass locally (the full suite is 126 / 126) — worth adding. Codemagic has no path filter |
| D20 | Low | Platform | Next 16 deprecations: `middleware` → `proxy`, React 18 support ends in Next 17, Edge runtime on `/api/og` |
| D21 | Info | Product copy | The README says to keep copy worldwide, but Nigeria/Africa-specific blog, resource and pricing copy exists (and the CV-review prompt is written for "Africa"). Fine if intentional |

## Verified sound

* **Web paywall:** apply links, employer names and other paid fields never enter a shared cache,
  the DOM, metadata, JSON-LD or client-island props for free/anonymous visitors.
* **Web security posture:** CSP/HSTS/frame headers present; admin routes gated (admin portal knock
  cookie, `requireAdmin`, suspended-admin kill switch, email-2FA); cron routes fail closed on a
  missing/short secret with constant-time compare.
* **Payments:** `paystack-initialize` (email confirmed, suspended check, upgrade-only guard, checkout
  host/reference allow-list), `paystack-verify`, and the webhook are consistent; no recurring
  Paystack subscriptions exist, so account deletion can't leave billing running.
* **Other routes read end to end:** `/api/cv` (magic-byte validated), `/api/contact` (escaped, no
  auto-reply), `/r/[code]`, `/api/email/unsubscribe` (HMAC with domain separation, constant-time
  compare, no account oracle), `/api/ai/*` (signed in + email confirmed + per-user and per-IP caps),
  `/api/ats/save`, `/api/saved-jobs`, `/api/alerts`.
* **Mobile:** session stored encrypted (AES key in the keystore, ciphertext in AsyncStorage),
  PKCE, OAuth callback parsing, Paystack return handling, entitlement invalidation on sign-out.
* **Edge functions:** deployed `paystack-verify`, `paystack-initialize` and `send-job-alerts` match
  the repo; the AI paywall is enforced server-side.
* **RLS:** every public table has RLS; the five tables with no policies (`admin_2fa_codes`,
  `ats_board_backoff`, `ats_board_checks`, `cron_locks`, `paystack_transactions`) are service-role only.
* `job_alerts` has 0 rows because alerts are Pro-only and only 3 of 416 profiles are Pro; the
  alert-loop fix from the last audit is applied in production (`last_sent_at`).

## Not covered

* No physical-device or emulator run of the app, and no iOS build or review.
* Production site couldn't be fetched from this environment (outbound policy), so web evidence
  comes from the local build, the Vercel connector's logs, and the database.
* Paystack dashboard, Resend deliverability, and the Google/LinkedIn provider configuration.
* Load testing and any active exploitation attempt — probes were limited to benign malformed input
  against a local build.
* The Play Console / App Store Connect state (no credentials linked).
* `supabase` (project-scoped MCP server) failed to connect in this session; the Supabase connector
  worked and all database checks were read-only.

## Suggested order

1. **D1** (profile writes) — it silently breaks a visible feature; decide (a)/(b) and ship with D5.
2. **D2** rotate the cron secret; **D3** fix or unschedule the archiver.
3. **D6** add the `.well-known` files once you have the cert fingerprint and Team ID.
4. **D7/D8** before any store submission: production build, crash DSN, billing-policy review.
5. **D4**, then **D9/D10**.
6. Merge the CI change in this PR first so the e2e suite starts guarding the pricing/login/sitemap
   behaviour again.
