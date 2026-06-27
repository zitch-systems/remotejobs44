# RemoteJobs44 — Critical Functionality Audit

_Date: 2026-06-26 · Branch: `claude/functionality-audit-0dz4i1`_

## Remediation status (this branch)

The confirmed bugs below have been **fixed** on this branch (validated: `tsc`
clean, 388/388 unit tests pass, 0 lint errors):

| # | Issue | Fix |
|---|-------|-----|
| 1 | Homepage paywall leak | `FeaturedJobs` no longer maps `apply_url`/`apply_email` into the client `JobCard` payload |
| 2 | Paystack verify replay | verify + webhook now claim the immutable `paystack_transactions` (reference-PK) ledger before crediting |
| 3 | SSRF DNS-rebinding | new `validateExternalUrlAndResolve()` resolves DNS + rejects private/metadata IPs; wired into the admin-source fetch, sources-insert, `/api/rss`, `/api/ats`, ats-engine redirect-follow, render-js |
| 4 | `/admin/*` no server gate | middleware now reads `profiles.role` for `/admin/*` and bounces confirmed non-admins to `/dashboard` |
| 5 | Sort ignored during search | filter UI drops the "Highest salary" option when a query is active (the FTS path can't honour it) |
| 6 | Day-pass apply TOCTOU | `migration_v59.sql` enforces the 10-cap atomically in the trigger via a per-user advisory lock |
| 7 | Feed size-cap after buffering | Content-Length pre-check added to the 3 ingest fetch paths |
| 8 | Profile dead links | `#emails` / `#danger` anchors added on the billing page; profile link points at the danger zone |
| 9 | `findCompany` double query | wrapped in React `cache()` |
| 10 | Region/country filter mismatch | `REGION_TERMS` extracted to `lib/jobs/region-terms.ts` and expanded to cover every UI country option |

Residual (documented, not fixed): the rate-limiter is still in-memory/per-instance
(needs a shared store — infra change); the SSRF fix closes the static-record case but
true connect-time IP pinning needs a custom dispatcher the runtime doesn't expose; the
two test-coupled derived-URL fetch paths (`apply-link`, `feed-discovery`) keep the
synchronous guard. The posture/Low items in the lists below are left as-is.

## Method

Six parallel domain audits (auth/access, payments, ingestion/SSRF, user APIs, admin
APIs, frontend/UX) read the actual code across `app/`, `lib/`, `middleware.ts`,
`components/`, and `supabase/`. The top 12 Critical/High findings were then run
through an **adversarial verification pass** — one independent skeptic per finding,
instructed to refute it against the code. Severities below are the verified
assessments, not the first-pass guesses.

Headline result: the codebase is unusually well-hardened (column-level REVOKE +
server-side paywall, HMAC webhook verify with constant-time compare, SSRF guard with
redirect:'error', constant-time cron auth, consistent `requireAdmin`). The real,
confirmed gaps are concentrated and listed first.

---

## Confirmed issues worth fixing

### 1. [HIGH] Homepage leaks paywalled apply links to anonymous users — `components/home/FeaturedJobs.tsx`
`fetchFeatured()` uses the **service-role** client + `.select('*')` (bypasses the
`migration_v16` column REVOKE) and maps `apply_url`/`apply_email` unconditionally
(`FeaturedJobs.tsx:34-35`) into the `Job` passed to `<JobCard>` — a **client**
component (`components/jobs/JobCard.tsx:1` `'use client'`). Next.js serializes *all*
props of a client component into the RSC/Flight payload, so the paid-only off-site
apply links for the featured jobs ship to every anonymous visitor in the homepage HTML.
The `/jobs` path does this correctly via `transform(j, seePaid)` (`app/jobs/page.tsx:101-102`);
the homepage skips the gate.
- **Impact:** paywall bypass on the highest-traffic page (scope: the ~6 featured jobs, not the whole catalog).
- **Fix:** select `SAFE_JOB_COLUMNS`, or strip `applyUrl`/`applyEmail` before passing `job` to `JobCard` (mirror `app/jobs/page.tsx`).

### 2. [HIGH] Paystack `verify` can re-credit via replay of an old reference — `app/api/paystack/verify/route.ts`
The `GET` handler is **unauthenticated** (acts on the `reference` query param;
callback URL set at `initialize/route.ts:128`). Idempotency relies solely on
`subscriptions.paystack_reference` (`verify:83-90`), but the table is one-row-per-user
(`onConflict:'user_id'`, unique on `user_id`), so a **renewal overwrites the old
reference**. Replaying an older success-callback URL then no longer matches, and
verify re-fetches it from Paystack (a past charge returns `success` forever), re-passes
`chargeMatchesPlan`, and extends `plan_expires_at` by another full term. The web route
never writes the durable `paystack_webhook_events`/`paystack_transactions` ledgers (the
mobile edge function already does — `supabase/functions/paystack-verify/index.ts:70`).
- **Preconditions:** attacker replays *their own* prior reference after they've renewed at least once. Self-supplied URL, no session needed. Repeatable → free plan extension.
- **Fix:** claim an immutable per-`reference` ledger row (like the edge function) before crediting; the `subscriptions.paystack_reference` column is the wrong anchor because it's overwritten.

### 3. [MEDIUM] SSRF guard is hostname-string only — DNS-rebinding bypass — `lib/ssrf-guard.ts`
`validateExternalUrl` blocks literal private IPs (decimal/octal/hex are normalized by
WHATWG `URL` and correctly caught) but **never resolves DNS or pins the connected IP**.
A public name that resolves to an internal/link-local IP (e.g. `169.254.169.254.nip.io`,
or attacker-controlled DNS) passes the guard; `fetch`/puppeteer/undici then do their own
lookup and connect to the internal IP. Affects admin-added feeds in the daily cron
(`ingest-pipeline.ts:475-489`), WPJM enrichment, `ats-engine.ts`, `render-js.ts`. The
redirect re-validation also only re-checks the hostname string, so it's defeated the same way.
- **Preconditions:** plant a source URL — gated by `requireAdmin` at the API, but the code itself notes rows can be SQL-inserted out-of-band. Reachable IMDS/internal services from the server.
- **Fix:** resolve the host, reject if any resolved A/AAAA is private/link-local/metadata, and pin that IP for the connection (custom undici `lookup`/dispatcher) to also close the rebinding TOCTOU.

### 4. [MEDIUM] `/admin/*` pages have no server-side role gate — `middleware.ts:182-186`
The `/admin/*` role check in middleware is an **explicit no-op** (block body is only
comments); the only enforcement is the client-side `app/admin/layout.tsx` `useEffect`
redirect. A logged-in non-admin can briefly render the admin shell. **Mitigated:** all
18 admin pages are `'use client'` and every `/api/admin/*` route independently calls
`requireAdmin`, so no admin *data* leaks — only the UI chrome/nav, briefly.
- **Fix:** add a server-side role check (in middleware or a server layout) so `/admin` isn't gated by the client alone.

---

## Confirmed but Low — correctness / UX

| # | Finding | Location |
|---|---------|----------|
| 5 | **Sort silently ignored during search.** The `search_jobs` FTS RPC has no sort param; the q-present branch always orders by `ts_rank`, so "Highest salary" does nothing while a query is active. (`salary_max` is ~0% populated, so salary sort is near-useless even without a query, yet the option is still shown.) | `app/jobs/page.tsx:196-209`, `migration_v17.sql:114-153`, `JobsFiltersBar.tsx:78-82,231` |
| 6 | **Daily-pass 10-apply cap is a count-then-insert TOCTOU.** Parallel POSTs to distinct jobs can each read `count<10` and all insert; no DB-level cap (the trigger only enforces the free 3-in-7). Day-pass buyer can exceed 10/period. | `app/api/applications/route.ts:203-248`, `migration_v56.sql:71` |
| 7 | **Feed size cap applied after full buffering.** `MAX_FEED_BYTES` is checked *after* `await res.text()`, so a malicious/compromised admin-source host streaming a large body within the 15s timeout can OOM the cron function. `redirect:'error'` closes the redirect sub-vector; `/api/rss` already does the Content-Length pre-check that's missing here. | `lib/ingest-pipeline.ts:492-493`, `feed-discovery.ts:118`, `apply-link.ts:166` |
| 8 | **City landing pages are thin/near-duplicate.** The `.or(...%remote%,...%worldwide%)` arms match almost the whole catalog (every job defaults to "Remote"/"Worldwide" at ingest), so all 15 city pages render essentially the same feed. Defensible as a remote-jobs product choice, but a real SEO doorway/duplicate-content risk. Country pages share the pattern. | `app/jobs/city/[slug]/page.tsx:57` |

---

## Reported by domain audits — not independently re-verified (medium confidence)

These came from the first-pass audits and are consistent with the code I saw, but were
not put through the adversarial pass. Worth confirming before acting.

- **In-memory rate limiter is per-instance** (`lib/rate-limit.ts:8`). On serverless, every abuse/cost cap (AI CV-review & interview-prep, contact form, 2FA verify/send brute-force, password-reset bombing) is effectively `limit × warm instances` and resets on cold start. The durable per-code `MAX_CODE_ATTEMPTS=5` is the real 2FA backstop. The file itself flags "swap for Upstash Redis." This is the single most load-bearing weakness — many other controls quietly depend on it.
- **Profile deep-links are dead** — `app/profile/page.tsx:494-511` links to `/profile/billing#emails` and a delete-account anchor that don't exist on the billing page.
- **`findCompany()` runs its 200-row query twice per request** (no React `cache()`) — `generateMetadata` + page body each hit Supabase. `app/companies/[slug]/page.tsx:35-86`.
- **Region/Country filter vocabulary mismatch** — the UI offers `singapore`, `australia`, `uae`, etc. that aren't in the server's `REGION_TERMS` map, so they fall to a literal `%slug%` match (`uae` misses "Dubai"). `JobsFiltersBar.tsx:83-130` vs `app/jobs/page.tsx:49-62`.
- **Industry pages substring-match short tokens** — `ai` matches "available/maintain/campaign". `app/jobs/industry/[slug]/page.tsx:41-64`.
- **2FA verified-session cookie is bound only to `userId`, not the Supabase session** — survives password change / sign-out for its 12h TTL; can't be individually revoked short of rotating the shared secret. `lib/auth/admin-2fa-server.ts:46-66`.
- **2FA HMAC secret falls back to the service-role key** — `ADMIN_2FA_SECRET || SUPABASE_SERVICE_ROLE_KEY`. Reuses the most sensitive secret for cookie signing. `lib/auth/admin-2fa-server.ts:25-27`.
- **`restore-subscription` has no rate limit / monetary safeguard** — a compromised admin can mass-grant paid plans (audit-logged, but no preventive cap). `app/api/admin/users/[id]/restore-subscription/route.ts`.
- **AI-discovery quota fails open** on a count error and the feeding audit insert is fire-and-forget — paid-LLM spend can exceed the 200/24h ceiling. `app/api/admin/ai-discovery/route.ts:61-86,291`.
- **ReDoS risk** in hand-rolled regex feed parsing over up-to-5MB admin-source bodies (`lib/feed-parser.ts`, `lib/apply-link.ts:62`). Note: no real XML parser is used, so XXE/billion-laughs do **not** apply.
- **`dedupe_jobs()` keeps the highest-engagement row**, which can deactivate a fresher duplicate carrying the only working `apply_url`. `supabase/migration_v30.sql:25-46`.
- **`CompanyMask` sets `aria-hidden` on the only node with the company name** — screen-reader users get no company context. `components/jobs/CompanyMask.tsx:37`.
- **`JobPosting.validThrough` fallback (`posted + 30d`)** can emit an already-expired date for jobs visible up to 60d → Google Jobs drops them. `app/jobs/[id]/page.tsx:212-216`.
- **Metadata count inconsistency** — "70,000+" vs "50,000+" across `app/jobs/layout.tsx`, `app/jobs/page.tsx`, `app/page.tsx`; two `metadata` exports both claim canonical `/jobs`.

---

## Refuted / posture-only (do not spend effort)

- **Webhook dedup collision dropping downgrade events — REFUTED.** This was a real historical bug (the standalone `unique(paystack_id)` in `migration_v20`) but was **already removed by `migration_v57`**; the current key is the composite `(event_type, paystack_id)`, and the daily cron downgrades expired subs independently of webhook delivery. No revenue leak in the committed schema.
- **Admin 2FA "off by default" — Low / posture.** `ADMIN_MFA_REQUIRED` defaults false by *deliberate, documented* lockout-safe rollout (`lib/auth/mfa.ts:7-15`). When off, admin access still requires full Supabase session + role + not-suspended checks; 2FA is defense-in-depth, not the sole gate. Action: set `NEXT_PUBLIC_ADMIN_MFA_REQUIRED=true` in production once the mailbox is confirmed.
- **2FA OTP to a shared mailbox — Low.** Both 2FA endpoints require the caller to *already* hold the target admin's Supabase session, and the code is bound to `adminId`; inbox access alone can't complete a challenge. Real but minor: deliver the OTP to `admin.adminEmail` (already available) instead of the fixed address.
- **Admin broadcast "unsanitized HTML phishing" — Low.** Requires a fully authenticated, 2FA-passed admin who is already trusted to send brand-domain email; raw HTML is expected for templated email. Hardening (confirm token, rate limit) rather than a vuln.

---

## Verified-solid (no action)

XSS-safe job descriptions (tag-stripped, no `dangerouslySetInnerHTML` on user content);
JSON-LD `<` escaping; visibility filter chaining (active + not-expired + not-flagged) is
correct and NULL-safe; pagination works without JS; IDOR-safe user routes (all scoped to
`user.id`); CV upload (MIME + size + **magic-byte** + private bucket + signed URLs);
webhook HMAC SHA-512 constant-time verify; amount/currency tampering blocked server-side;
referral self-referral/theft blocked + idempotent; cron auth fail-closed + constant-time;
`/api/scrape` and `/api/admin/promote` disabled (410); LLM-output `applyUrl` scheme-validated.

---

## Suggested priority order

1. **#1 Homepage paywall leak** — small, contained, direct revenue impact.
2. **#2 Paystack verify replay** — add the per-reference ledger claim.
3. **Rate-limiter → shared store** — unblocks every other cost/abuse cap.
4. **#3 SSRF IP pinning** + **#4 server-side admin gate** — defense-in-depth.
5. UX/correctness batch: #5 sort, #6 apply-cap, profile dead links, region/country map, validThrough, metadata counts.
