# RemoteJobs44 — Security, UX & SEO/AIO Audit + Rebuild Blueprint (2026)

> Cross-functional review (Product · Security · Full-Stack). This document
> records what was audited, what was **changed in this PR**, and the
> **advisory roadmap** for the rest. It is deliberately honest: a large share
> of the "issues" in the original brief were **already solved** in this
> codebase, so the high-value work was a small set of real gaps — not a
> rebuild.

---

## 0. Audit verdict (TL;DR)

| Area | Pre-existing state | This PR |
|---|---|---|
| HTTP security headers (CSP, HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy) | ✅ Already shipped in `next.config.js` | Documented; nonce-hardening path noted |
| Paystack webhook HMAC-SHA512 verification | ✅ Already shipped | — |
| AI prompt-injection defense (XML-tag wrapping + instruction hardening) | ✅ Already in `app/api/ai/*` | Documented |
| Per-user **and** per-IP rate limiting | ✅ `lib/rate-limit.ts` | Documented |
| SSRF guard on outbound fetches | ✅ `lib/ssrf-guard.ts` | — |
| JSON-LD: WebSite, Organization, FAQPage, JobPosting, Breadcrumb | ✅ Shipped | **Added `WebApplication`** (the missing one) |
| `ai.txt`, `llms.txt`, `llms-full.txt`, AI-bot `robots` rules | ✅ Shipped | — |
| `next/font` self-hosting, skip-link, reduced-motion | ✅ Shipped | — |
| **Mobile safe-area / bottom cutoff** | ❌ `viewport-fit=cover` missing → `env(safe-area-inset-*)` was always `0` | **Fixed** |
| **Fluid typography system** | ⚠️ Only hand-rolled inline `clamp()` on the hero | **Added accessible fluid scale** |
| **WhatsApp link** hardening | ⚠️ Number hardcoded in 5 files | **Centralized + encoder** |
| **CI/CD security scanning** | ❌ None (only build/test/lint) | **Added** Dependabot + CodeQL + audit + dependency-review |

**Bottom line:** the platform was already hardened well beyond the brief's
assumptions. The reported "app cuts off at the bottom on mobile" had a single
precise root cause (below), now fixed.

---

## 1. UI/UX critical fixes

### 1.1 Mobile viewport cutoff — root cause & permanent fix

**Root cause.** `env(safe-area-inset-bottom)` only resolves to a non-zero
value when the document opts in with **`viewport-fit=cover`**. That property
was absent from the `viewport` export, so:

- the `.pb-safe` already on `<BottomNav>` evaluated to `max(8px, 0) = 8px` —
  a **no-op** on notched iPhones, and
- `<main>` reserved a flat `pb-[68px]`, but the bottom nav's real footprint is
  **72px + the home-indicator inset**, so the last row of content sat *under*
  the bar.

**Fix (shipped in this PR):**

`app/layout.tsx` — opt the document in:

```ts
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 5,
  viewportFit: 'cover',          // ← makes env(safe-area-inset-*) real
  themeColor: [ /* … */ ],
};
```

`app/globals.css` — one source of truth for chrome + insets, and offset
utilities that keep `<Header>`, `<main>` and the mobile menu in lock-step:

```css
:root {
  --app-header-h: 68px;
  --app-bottomnav-h: 72px;
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

body { min-height: 100svh; min-height: 100dvh; } /* dynamic viewport */

.app-header  { top: 0; height: calc(var(--app-header-h) + var(--safe-top));
               padding-top: var(--safe-top); }
.app-menu-top{ top: calc(var(--app-header-h) + var(--safe-top)); }
.app-main    { padding-top: calc(var(--app-header-h) + var(--safe-top));
               padding-bottom: calc(var(--app-bottomnav-h) + max(8px, var(--safe-bottom))); }
@media (min-width: 768px) { .app-main { padding-bottom: 0; } }
```

Applied: `<main className="flex-1 app-main">`, `<Header className="… app-header …">`,
mobile menus use `app-menu-top`. Result: content clears the notch **and** the
home indicator on iOS + Android, with **zero** magic numbers to drift.

> Also converted full-height containers from static `vh` → `dvh`
> (`100vh`→`100dvh`, `80vh`→`80dvh`) on the auth, error, not-found, admin and
> agent shells — static `vh` overflows behind the mobile URL bar, the other
> half of "cut off at the bottom".

**QA checklist (manual, real devices):**
- [ ] iPhone (notched) Safari — bottom nav above home indicator; last CTA visible.
- [ ] iPhone PWA "Add to Home Screen" — header below the status bar/notch.
- [ ] Android Chrome — no extra gap; nav flush.
- [ ] Landscape — content not under the rounded corners (`--safe-left/right`
      available if a future full-bleed element needs them).

### 1.2 Fluid typography (accessible, `clamp()`)

The font **stack** was already robust (`Sora` display + `DM Sans` body, both
self-hosted via `next/font`, with `system-ui` fallback) — no need to swap to
Inter. The gap was a **systematic fluid scale**: only the hero hand-rolled
inline `clamp()`, and it used a **pure-`vw`** slope which ignores browser zoom
and fails WCAG 1.4.4 (Resize Text).

Added to `tailwind.config.js` — a `clamp(min, rem-anchor + vw-slope, max)`
scale (the `rem` anchor is what keeps it zoom-responsive):

```js
fontSize: {
  // …existing fixed scale kept (additive — no page shifts)…
  'display-1': ['clamp(2rem, 1.18rem + 4.1vw, 3.75rem)',   { lineHeight: '1.05', letterSpacing: '-0.02em' }],
  'display-2': ['clamp(1.75rem, 1.2rem + 2.75vw, 3rem)',   { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
  'display-3': ['clamp(1.5rem, 1.18rem + 1.6vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
  'fluid-h2':  ['clamp(1.5rem, 1.29rem + 1.05vw, 2rem)',   { lineHeight: '1.2',  letterSpacing: '-0.01em' }],
  'fluid-lead':['clamp(1.0625rem, 1.01rem + 0.28vw, 1.25rem)', { lineHeight: '1.6' }],
}
```

Migrated the landing page (`HeroSection`, `CTASection`) off inline styles to
`text-display-1` / `text-fluid-lead` / `text-display-2`. **Migration path** for
the rest: replace `text-3xl`/`text-4xl` section headings with `text-display-3`
/ `fluid-h2` as they're touched — no big-bang refactor.

---

## 2. Security audit & hardening

### 2.1 WhatsApp integration — honest finding + hardening

**Finding.** There is **no WhatsApp Business API** integration in this
codebase. WhatsApp is a **click-to-chat deep link** (`https://wa.me/<number>`)
to support, previously hardcoded in 5 files. Therefore:

- **`X-Hub-Signature-256` webhook validation is N/A today** — there is no
  inbound webhook to validate. (Blueprint below for when/if you adopt the API.)
- **Deep-link hijack risk** for the current design = someone editing one of the
  5 hardcoded numbers to redirect prospects. Mitigated by centralizing.

**Shipped:** `lib/whatsapp.ts` — one audited `WHATSAPP_NUMBER` + a `waLink()`
builder that **URL-encodes** any prefilled message (so a dynamic message can't
smuggle extra query params / break the URL). All call sites refactored; all keep
`target="_blank" rel="noopener noreferrer"`.

```ts
export const WHATSAPP_NUMBER = '2349169582776';      // E.164 digits, audited once
export function waLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
```

**Blueprint — WhatsApp Business API (future state).** If you move from
deep-link to real messaging (notifications, two-way support), use a **backend
proxy** (never call Graph API or expose the token client-side) and verify every
inbound webhook. Model it on the existing Paystack HMAC verifier:

```ts
// app/api/whatsapp/webhook/route.ts  (pseudo-code, mirrors lib/paystack)
import crypto from 'node:crypto';
export const runtime = 'nodejs';

// 1) Meta verification handshake (GET, once at subscribe time)
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' &&
      u.searchParams.get('hub.verify_token') === process.env.WA_VERIFY_TOKEN) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

// 2) Signed event delivery (POST) — verify X-Hub-Signature-256 over the RAW body
export async function POST(req: Request) {
  const raw = await req.text();                          // raw bytes, pre-JSON.parse
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WA_APP_SECRET!)     // Meta App Secret
    .update(raw).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {  // constant-time
    return new Response('bad signature', { status: 401 });
  }
  // rate-limit per sender, enqueue, ACK fast (Meta retries on slow/non-200)
  return new Response(null, { status: 200 });
}
```

Controls: secrets server-side only · timing-safe compare · verify before parse ·
per-sender rate limit (reuse `lib/rate-limit.ts`) · idempotency on message id ·
template/opt-in compliance to avoid Meta spam bans.

### 2.2 Vulnerability checklist (XSS · CSRF · IDOR · SQLi)

| Class | Status in this codebase | Control / snippet |
|---|---|---|
| **XSS** | Strong | React auto-escapes; the only `dangerouslySetInnerHTML` are JSON-LD blocks, all run `.replace(/</g,'\\u003c')`. CSP blocks injected script. Contact form HTML-escapes before email. **Action:** keep the "no raw user HTML" invariant; prefer CSP **nonce** over `'unsafe-inline'` (2.5). |
| **CSRF** | Good | State changes are JSON `fetch` to same-origin `/api/*` authenticated by the Supabase session (`getUser()`), not by ambient form posts. **Action:** keep auth cookies `SameSite=Lax/Strict`; reject cross-site `Origin` on mutating routes for defense-in-depth: |
| **IDOR** | Good | Supabase **RLS** is the backstop; API routes also scope by `user.id`. **Action:** never trust an `id` from the body — always filter by the authenticated user (`.eq('user_id', user.id)`); audit every `/api/admin/*` for `requireAdmin`. |
| **SQLi** | N/A by construction | All DB access goes through the Supabase client (parameterized) / PostgREST — no string-built SQL. **Action:** if raw SQL via `rpc()` is ever added, pass args as parameters, never interpolate. |

CSRF origin-check helper (defense-in-depth for mutating routes):

```ts
function sameOrigin(req: Request): boolean {
  const o = req.headers.get('origin');
  if (!o) return true;                         // non-CORS (same-site) navigations
  try { return new URL(o).host === new URL(req.url).host; } catch { return false; }
}
// if (['POST','PUT','PATCH','DELETE'].includes(req.method) && !sameOrigin(req))
//   return NextResponse.json({ error: 'bad origin' }, { status: 403 });
```

### 2.3 Future-proofing

- **AI prompt injection** — *already defended* in `app/api/ai/cv-review` &
  `interview-prep`: untrusted content is wrapped in `<user_cv>…</user_cv>`, the
  system prompt instructs the model to ignore embedded instructions, and
  `escapeForPrompt()` strips angle brackets. **Recommended next:** treat model
  output as untrusted too (you already do — JSON-only, server-side parse, never
  echo raw output to the client); add an allowlist/length cap on structured
  fields before rendering.
- **Supply chain** — committed `package-lock.json` (exact pinning) + the new
  **Dependabot** (`.github/dependabot.yml`) + `npm audit` gate + Dependency
  Review + CodeQL (`.github/workflows/security.yml`). **Hardening option:** pin
  GitHub Actions to commit SHAs (Dependabot keeps them current).
- **Bot scraping** — `robots.ts` blocks faceted `/jobs?…`, rate-limiting caps
  abuse, SSRF guard protects the scraper itself. **Recommended:** enable
  Vercel WAF / bot management on `/api/*`; add a per-IP token bucket on the
  public search API; keep the in-memory limiter's TODO (move to KV/Redis so it
  enforces across serverless instances).

### 2.4 HTTP security headers (already shipped — for reference)

`next.config.js` already returns, on `/(.*)`: `Content-Security-Policy`,
`Strict-Transport-Security` (`max-age=63072000; includeSubDomains; preload`),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` +
`frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`. `poweredByHeader:
false`. **Only real hardening left:** replace `script-src 'unsafe-inline'` with a
**per-request nonce** (Next.js supports this via middleware) so an injected
inline `<script>` can't execute even if it reaches the DOM.

### 2.5 CI/CD security pipeline (added this PR)

`.github/workflows/security.yml`:
- `npm audit --omit=dev --audit-level=high` — **always-on** gate; fails on
  high/critical in prod deps (verified: currently 0 vulnerabilities).
- `dependency-review-action` — blocks PRs adding vulnerable/disallowed-license deps.
- **CodeQL** (`javascript-typescript`, `security-extended`) — static analysis.
- Weekly `schedule` to catch advisories disclosed after merge.

> **GHAS gating.** `dependency-review` and `codeql` require the Dependency
> Graph + GitHub Advanced Security, which on a **private** repo needs a GHAS
> licence (they're free on public repos). Both jobs are therefore gated on
> `github.event.repository.visibility == 'public'` so they **skip cleanly**
> (neutral, not a red ❌) on this private repo and activate automatically if it
> goes public or GHAS is enabled in
> `Settings → Code security and analysis`. `npm audit` runs everywhere, so the
> dependency gate is never absent.

`.github/dependabot.yml` — weekly npm + github-actions update PRs (dev deps
grouped; framework majors pinned for deliberate adoption).

---

## 3. SEO & AI Optimization (AIO)

### 3.1 Traditional SEO

**Added** the missing product schema to the site-wide `@graph` in
`app/layout.tsx` (joins existing `WebSite` + `Organization`; `FAQPage`,
`JobPosting`, `BreadcrumbList` already exist on their pages):

```jsonc
{
  "@type": "WebApplication",
  "@id": "https://remotejobs44.com/#app",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web, iOS, Android",
  "isAccessibleForFree": true,
  "publisher": { "@id": "https://remotejobs44.com/#organization" },
  "featureList": [ "70,000+ verified remote jobs", "AI CV review", "AI interview prep", "…" ],
  "offers": [
    { "@type": "Offer", "name": "Free",        "price": "0",     "priceCurrency": "NGN" },
    { "@type": "Offer", "name": "Day Pass",    "price": "500",   "priceCurrency": "NGN" },
    { "@type": "Offer", "name": "Pro Monthly", "price": "2999",  "priceCurrency": "NGN" },
    { "@type": "Offer", "name": "Pro Annual",  "price": "29999", "priceCurrency": "NGN" }
  ]
}
```

> **No `aggregateRating` is emitted** — there's no first-party review data, and
> inventing star ratings violates Google's structured-data policy (manual
> action risk). Add it here **only** once a real review pipeline exists.

Validate after deploy: Google **Rich Results Test** + Schema.org validator on
`/`, `/faq`, a `/jobs/[id]`, and a `/salary-guide/*`.

### 3.2 AI visibility (ChatGPT · Claude · Perplexity)

Already strong: `public/ai.txt` (content-use policy), `public/llms.txt` +
`llms-full.txt` (the citation-friendly summary LLMs prefer), `robots.ts`
explicitly allows `GPTBot` / `ClaudeBot` / `PerplexityBot`, and the homepage
declares `ai-content-declaration: human-authored` + `<link rel="alternate">` to
both files.

**Semantic-HTML guidance** (keep enforcing; mostly already true):
- Exactly **one `<h1>` per page** (hero `<h1>` ✓), descriptive and keyword-true.
- Single `<main id="main-content">` landmark ✓; sections in `<section>` with an `<h2>`.
- **First 100 words = the answer.** LLMs weight the opening heavily, so the lead
  paragraph should state *what RemoteJobs44 is, who it's for, and the headline
  number* in plain prose (the hero lead already does — keep it factual, not
  slogan-only).
- Keep `llms.txt` in sync with pricing/feature changes — it's the canonical
  machine summary; stale numbers there → wrong AI citations.

**`ai.txt` note:** it already exists and follows the Spawning spec. Keep the
maintainer email and the "citation welcome, training requires a license" stance;
re-publish whenever the sourcing list changes.

---

## 4. Implementation roadmap (Phase 1 → 4)

**Phase 1 — Ship now (this PR).** Mobile safe-area system (`viewport-fit` +
`app-*` utilities + `dvh`); fluid type scale + landing migration; `WebApplication`
JSON-LD; `lib/whatsapp.ts` hardening; Dependabot + security workflow. *Verify:*
`type-check` ✓ + `lint` ✓ + build; real-device QA from §1.1.

**Phase 2 — Security hardening (1–2 wks).** CSP **nonce** (drop
`script-src 'unsafe-inline'`); CSRF `Origin` check on mutating routes; move the
rate-limiter to KV/Redis for cross-instance enforcement; enable Vercel WAF/bot
rules on `/api/*`; turn on GitHub secret-scanning + push protection.

**Phase 3 — SEO/AIO deepening (2–4 wks).** Rich-Results validation pass across
page types; per-page `WebPage`/`Article` nodes where missing; review pipeline →
then add `aggregateRating`; keep `llms.txt`/`ai.txt` in a release checklist;
monitor AI-referral traffic and citation accuracy.

**Phase 4 — Continuous.** Dependabot triage cadence; Lighthouse/Speed-Insights
budget in CI; quarterly header + schema review; WhatsApp Business API webhook
(§2.1) only if/when two-way messaging is on the roadmap.
