# RemoteJobs44 — Performance Report

**Date:** 2026-07-01
**Field data source:** Vercel Speed Insights, last 7 days, as shared by the site owner (screenshots, not re-derived here).

## Field Data Snapshot

| Route | Platform | Real Experience Score | Notes |
|---|---|---|---|
| `/` (landing) | Desktop | 60 (Needs Improvement) | LCP 4.59s, CLS 0.28, INP 248ms |
| `/` (landing) | Mobile | 75 | LCP 4.42s, CLS 0.14, INP 224ms |
| `/dashboard` | Both | 3–44 (Poor) | Worst route on the site |
| `/profile` | Mobile | 23 (Poor) | |
| `/jobs`, `/login`, `/pricing` | Mobile | 70–82 (Needs Improvement) | High-traffic, moderate scores |
| `/register`, `/jobs/category/[slug]` | Mobile | 98 (Great) | |

The **landing page carries the most traffic** (437 mobile + 60 desktop samples in the last 7 days) so its LCP/CLS numbers move the aggregate score the most, but the **member routes score far worse in absolute terms**.

## Verified Findings

**Already well-optimized (no action needed):**
- Fonts load via `next/font/google` with `display: 'swap'` and explicit `fallback` metrics — this is exactly the fix for the classic web-font CLS/LCP problem, and it was verified earlier this session: delaying font files by 2.6s in a lab reproduction still produced negligible CLS (<0.03), ruling fonts out as the field CLS driver.
- The hero background image is a 41KB, `fetchPriority: 'high'`-preloaded AVIF with WebP/JPEG fallback via `image-set()` — already the smallest reasonable payload for that visual.
- `app/member.css` (~28KB, ~5KB gzip) is correctly scoped to `app/(member)/layout.tsx` rather than the root layout — verified in a production build that the landing's `<head>` links zero CSS chunks containing `.member-shell` rules. *(Shipped this session, PR #135.)*
- `app/jobs/[id]/page.tsx` intentionally has no page-level `revalidate` export — the route is dynamic (cookie-based plan check), and the actual 5-minute cache lives in `lib/jobs/job-detail.ts` via `unstable_cache`. **This was flagged as a gap by the initial audit pass and is incorrect; no action needed.**

**Real, verified issues:**

1. **Landing JS payload is heavy: ~922KB uncompressed across ~17 chunks** (measured in a production build this session), with the largest individual chunks at 138–233KB. This is the most likely driver of the landing's 224–248ms INP on real (non-fast) devices — a fast local machine only shows ~61ms of main-thread blocking, which under-represents mid-tier phones. **[High]**
2. **Heavy client-side libraries are not code-split.** `Header`, `MemberShell`, `Footer`, and `BottomNav` are all `'use client'` and import Lucide icons + Radix UI primitives that ship on every route, including the landing, even though `MemberShell` is only ever rendered on signed-in routes. **[High]** — candidate fix: `next/dynamic(() => import(...), { ssr: false })` for `MemberShell`, and audit whether `Header`'s icon set can shrink.
3. **`MemberShell`'s avatar `<img>` (line 169) has no HTML `width`/`height` attributes.** *(Correction to the initial finding: this was flagged as "Critical" CLS, but `.tb-avatar` in `member.css` already sets `width: 34px; height: 34px` in CSS, which reserves the box before the image decodes — so the real-world CLS impact is much smaller than claimed.)* Still worth adding explicit `width={34} height={34}` as cheap, safe hardening — it's what Lighthouse-style "image elements have explicit width/height" checks look for regardless of CSS sizing, and it's a two-line, zero-risk change. **[Low, but free — being auto-fixed in this pass]**
4. **The member routes' far worse RES (3–44) is very likely a JS/hydration story, not an image story** — `/dashboard` redirects unauthenticated visitors to `/login` and `/profile`/`/jobs` render only fallback/error states without live credentials, so this session could not render the *real* authenticated experience to profile it directly (no access to RemoteJobs44's actual Supabase project from this environment — see caveat below). This needs either (a) the correct Supabase project connected so the real pages can be rendered and profiled locally, or (b) the Speed Insights "Paths" drill-down naming the specific shifting element on `/dashboard`.

## Caveat

This audit could not connect to RemoteJobs44's actual Supabase project (`gnyilmahiyddplsrrhoq` per `.env.example`) — the Supabase account available in this environment contains two unrelated projects. Consequently, the member-route performance investigation is based on static code review only, not a live-rendered profile of `/dashboard` or `/profile` with real data. **This is the single biggest limiter on diagnosing the worst-scoring routes with certainty.**

## Recommendations (Prioritized)

1. **[High]** Code-split `MemberShell` via `next/dynamic` so its Radix/Lucide-heavy bundle doesn't ship to routes that never render it.
2. **[High]** Run `next build` with `@next/bundle-analyzer` to find and eliminate any tree-shake misses on Lucide/Radix imports across `Header`, `Footer`, `BottomNav`.
3. **[Medium]** Once the correct Supabase project is connected, render and profile `/dashboard` and `/profile` for real to find their actual LCP/CLS culprits rather than guessing further.
4. **[Low]** Add explicit `width`/`height` HTML attributes to the `MemberShell` avatar `<img>` — safe, auto-fixed in this pass.
5. **[Low]** Lazy-load infrequently-shown modals (`PaywallModal`, etc.) with `next/dynamic` on job-listing routes.

Do **not** move `puppeteer-core`/`@sparticuz/chromium` to `devDependencies` — they're used at runtime by `lib/ats-engine.ts`/`lib/ats-detect.ts`/`lib/render-js.ts`, and doing so would break those server routes in production.
