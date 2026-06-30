# RemoteJobs44 — Landing page, **mobile view** — Claude Code handoff

> Scope: the **public marketing landing** (`/`) on **phone widths**. This doc is aligned to
> what is **already in `zitch-systems/remotejobs44@main`** — it is a *refine-in-place* brief,
> not a build-from-scratch one. The landing exists, is responsive, and renders a mobile layout
> today; this specifies that mobile view exactly and lists what to verify / polish.

## Files in this folder

| File | What it is | Use it for |
|---|---|---|
| `RemoteJobs44-Mobile-View.html` | Phone-frame viewer (390px) | Open this to **see** the intended mobile render |
| `RemoteJobs44-Landing.html` | Faithful static recreation of the live landing | Visual + markup reference; wired to the **real** `deep-ocean.css` |
| `deep-ocean.css` | **Verbatim copy** of `app/deep-ocean.css` from the repo | The actual production stylesheet (tokens + every section) |
| `assets/` | Hero + testimonial photos | Reference imagery |

The reference is **desktop-first responsive** (same as production): open `RemoteJobs44-Landing.html`
wide to see desktop, or `RemoteJobs44-Mobile-View.html` to see it at a true 390px viewport where
all the mobile breakpoints fire.

---

## 1. Where the landing lives in the repo (do not relocate)

The landing is **already built** as Next.js App Router + a single scoped stylesheet:

```
app/page.tsx                              # the route — renders <div className="deep-ocean"> + 13 sections
app/deep-ocean.css                        # ALL landing styles + tokens, scoped under .deep-ocean (48KB)
components/home/deep-ocean/
  Hero.tsx  HeroSearch.tsx  CountUp.tsx
  CompanyMarquee.tsx  Differentiator.tsx  Listings.tsx  Categories.tsx
  Featured.tsx  LiveWall.tsx  Mission.tsx  HowItWorks.tsx  Capabilities.tsx
  Testimonials.tsx  Faq.tsx  CtaBand.tsx
  data.ts            # server fetch (Supabase) — fetchLandingJobs / fetchCategoryCounts
  helpers.ts         # LandingJob type + payLabel / ageLabel / tintFor / compactCount
components/layout/Header.tsx               # marketing top bar + mobile hamburger menu
components/layout/BottomNav.tsx            # mobile bottom tab bar (md:hidden) — shows on the landing
components/layout/Footer.tsx               # marketing footer (rendered on every breakpoint)
app/globals.css                           # Tailwind base + app chrome offsets + safe-area vars
app/tailwind.config.ts                    # brand/accent palette → Tailwind theme
```

**Section order is fixed by `app/page.tsx`:**
Hero → CompanyMarquee → Differentiator → **Listings** → Categories → Featured → LiveWall →
Mission → HowItWorks → Capabilities → Testimonials → Faq → CtaBand.
There is **no Pricing section and no separate "Live feed" section** on the landing (pricing is
its own route `/pricing`). If you see an older handoff mentioning those on `/`, it is stale —
**this file + the repo win.**

---

## 2. The mobile chrome (this is the part most "mobile view" specs miss)

On a phone the landing is wrapped by **three app-level components**, not just the reflowed page:

1. **`Header.tsx`** — fixed top bar, 68px. Below `md` (768px) the nav links and the Log in /
   Get Started buttons **collapse into a hamburger**. The hamburger (3 bars → X) toggles a
   full-width dropdown (`app-menu-top` pins it under the safe-area-aware header) containing the
   nav links + auth buttons. Nav links are **Jobs · Companies · Salary Guide · Resources ·
   Pricing**. Logged-in users see Dashboard / Log Out instead of Log in / Get Started.
   - Logo = blue rounded-square (`#2563eb`) + white squiggle path + orange dot (`#f97316`) +
     wordmark **RemoteJobs44**; only the inner icon does the 3D flip (`.logo-icon-3d`), never
     the wordmark.
   - Theme toggle (lucide `Sun`/`Moon`, `next-themes`) stays visible on mobile.
2. **`BottomNav.tsx`** — fixed bottom tab bar, `md:hidden`, **shown on the public landing**
   (hidden only on member routes). Six tabs: **Home · Jobs · Saved · Applied · Profile ·
   Settings** (lucide icons). `Home` is active on `/`. Saved shows a count badge when logged in.
   `globals.css` reserves its height via `--app-bottomnav-h: 72px` + `pb-safe`.
3. **`Footer.tsx`** — rendered on **all** breakpoints (important for mobile SEO). Collapses to a
   2-column link grid on mobile with extra bottom padding (`pb-24 md:pb-8`) to clear the BottomNav.

> The reference recreates all three (`.mk-header` / `.mk-bottomnav` / `.mk-footer`) so you can
> see the full mobile frame, not just the scrolling content.

---

## 3. Current mobile behavior — the **real** breakpoints

`app/deep-ocean.css` is **desktop-first**. The mobile view is produced by these `max-width`
queries (plus Tailwind's `md` = 768px for the chrome above). This is the **authoritative**
mobile spec — match it; don't invent new hides:

**`@media (max-width: 960px)`** (tablet → large phone)
- `.hb-body` → **1 column** (hero copy stacks above the preview window)
- `.lw-stage` (Live wall) → **2 columns**, height 480px; columns 3–4 hidden (`:nth-child(n+3)`)
- `.mission-grid`, `.steps-grid`, `.diff-grid`, `.cap-grid`, `.statline` → **1 column**
- `.tcard-grid` (testimonials) → **1 column**
- `.cat-grid` (categories) → **2 columns**
- `.listing-grid` → **1 column**; `.filter-rail` becomes `position: static`
- `.preview` capped at 460px; floating `.hero-photo` nudged to `left:-16px`

**`@media (max-width: 900px)`** — `.fcard-grid` (Featured) → 2 cols; `.browse-grid` / `.detail-grid` → 1 col
**`@media (max-width: 720px)`** — `.job-row` collapses to `44px 1fr auto`; `.job-tag`, `.job-age`, `.job-arrow` hidden
**`@media (max-width: 560px)`** — `.fcard-grid` → **1 column**

**`@media (max-width: 520px)`** (phone)
- `.hero-b` bottom padding → 60px; `.hb-stats` gap → 26px
- `.hero-photo` → **`display:none`** (the floating "Hired remotely this week" card is hidden)
- `.lw-stage` → **1 column**, height 440px; columns 2–4 hidden (`:nth-child(n+2)`)
- `.cat-grid` → **1 column**

So on a ~390px phone the page is a clean single column: full hero (copy + preview window, no
floating photo), marquee, three differentiator cards stacked, single-column listings (no filter
rail width, compact job rows), 1-col categories, 1-col featured, a **single** live-wall column,
stacked mission stats, stacked steps, stacked capability tiles, stacked testimonials, FAQ
accordion, CTA — then the footer, with the bottom tab bar fixed over it all.

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` kills the marquee, preview/live-wall
auto-scroll, hero entrance, and all pulse dots. Keep that.

---

## 4. Section-by-section (mobile) — real classes + source

| # | Section | Component | Key classes | Mobile note |
|---|---|---|---|---|
| 1 | Hero | `Hero.tsx` + `HeroSearch.tsx` + `CountUp.tsx` | `.hero-b .hb-body .hb-copy .hb-search .hb-chips .hb-stats .preview .preview-track .hero-photo` | 1-col ≤960; hero photo hidden ≤520; H1 `clamp()` ~23px; stats count up (loops, pauses off-screen); `<em>remote</em>` flips |
| 2 | Company marquee | `CompanyMarquee.tsx` | `.band .marquee .marquee-track(.--rev) .logo-chip` | Two opposite-scrolling rows; **stays on mobile**; production uses self-hosted `/logos/<slug>.svg`, monogram fallback |
| 3 | Differentiator | `Differentiator.tsx` | `.diff-grid .diff-card .dnum .diff-mock` | 3 cards stack 1-col ≤960; mini-mocks kept |
| 4 | Listings | `Listings.tsx` (client) | `.listing-grid .filter-rail .job-list .job-row` | Rail goes static, list 1-col ≤960; rows compact ≤720; live client filter input |
| 5 | Categories | `Categories.tsx` | `.cat-grid .cat-tile` | 3→**2** (≤960)→**1** (≤520); counts from `fetchCategoryCounts` |
| 6 | Featured | `Featured.tsx` | `.fcard-grid .fcard(.--featured)` | 3→2 (≤900)→1 (≤560) |
| 7 | Live market wall | `LiveWall.tsx` | `.livewall .lw-stage .lw-col .lw-track .lw-card` | 4→2 (≤960)→**1** (≤520) columns; auto-scroll |
| 8 | Mission | `Mission.tsx` | `.mission-grid .mstat-grid .mstat` | Copy + 4 stats stack 1-col ≤960 |
| 9 | How it works | `HowItWorks.tsx` | `.steps-grid .step .price-row .price-pill` | 3 steps stack; step 2 shows **Day Pass · $3** / **Pro · $19/mo** |
| 10 | Capabilities | `Capabilities.tsx` | `.cap-grid .cap-tile .statline .si` | 6 tiles + 3-stat line, all 1-col ≤960 |
| 11 | Testimonials | `Testimonials.tsx` | `.tcard-grid .tcard .tcard-person .stars` | 1-col ≤960 |
| 12 | FAQ | `Faq.tsx` | `.faq-grid details.faq summary .pm` | Native `<details>`; first item `open`; "+" rotates to × |
| 13 | CTA band | `CtaBand.tsx` | `.cta-band .cta-inner .cta-actions` | Dark band; primary "Start Searching Free" → `/register` |

---

## 5. Tokens, fonts, assets

- **Tokens** are already in `app/deep-ocean.css` `:root` (and mirrored in `app/tailwind.config.ts`
  + `app/layout.tsx`). Brand **Deep Ocean blue** 600 `#2563eb` (700 `#1d4ed8` hover), accent
  **Sunrise orange** `#f97316`. Type ramp `--fs-2xs…5xl` (10→64px), radii `--radius-xs…2xl`,
  blue-tinted shadows `--shadow-*-brand`. Dark mode via `.dark` / `[data-theme="dark"]` (every
  token has a dark value). **Don't re-derive these — read them from `deep-ocean.css`.**
- **Fonts:** Sora (display 700/800) + DM Sans (body) via `next/font/local` (TTFs in `fonts/`).
  The reference uses the Google Fonts versions — identical metrics.
- **Assets (production paths):** hero bg `/redesign/hero-videocall-sm.jpg`; hero card +
  testimonials `/redesign/ig-high-five.jpg`, `/redesign/people-4-portrait.jpg`,
  `/redesign/ad-blazer-man.jpg`, `/redesign/ad-coffee-woman.jpg`. (The reference re-points the
  hero bg to its local `assets/` copy via an override block — production keeps `/redesign/…`.)

---

## 6. Refinement checklist (the actual ask on a phone)

Use the reference as the target and verify/refine these on real devices (360–430px):

- [ ] **No horizontal overflow** anywhere (hero stats, marquee, live-wall, job rows). Confirm
      `html, body` don't scroll sideways at 360px.
- [ ] **Tap targets ≥44px** — bottom-nav items, hamburger, search button, chips, FAQ summaries,
      category tiles.
- [ ] **Header + BottomNav safe areas** — content never hides behind either; `--safe-top` /
      `--safe-bottom` respected (notch + home indicator). `viewport-fit=cover` is set in
      `app/layout.tsx`.
- [ ] **Hero on a phone** — H1 legible (~23px), search bar + button full-width and not cramped,
      stat trio fits one row, floating photo correctly hidden ≤520, count-up + flip still run
      (and are static under reduced-motion).
- [ ] **Live wall** drops to a single column ≤520 and still auto-scrolls smoothly (one column is
      intentional — don't show 4 cramped columns).
- [ ] **Listings** — filter rail collapses sensibly (it goes static/full-width); consider
      whether the rail should be a collapsible "Filters" disclosure on phones rather than a tall
      static block before results. *(Open question — see §7.)*
- [ ] **Dark mode** parity on every section at mobile width.
- [ ] **Footer** is present on mobile (SEO) and clears the BottomNav (bottom padding).

## 7. Open questions for the team (don't guess)

1. **Mobile filter rail (Listings):** keep it as a static full-width block above results, or
   convert to a collapsible "Filters" sheet/disclosure on ≤960? (Current: static.)
2. **Carousels:** an earlier spec imagined Pricing/Testimonials as swipe carousels on mobile.
   Production currently **stacks** them 1-col. Keep stacked, or introduce scroll-snap carousels?
3. **Bottom nav on the public landing:** it currently shows for logged-out visitors too. Confirm
   that's desired (vs. members-only).

## 8. Out of scope

Member app, admin, `/jobs`, `/jobs/[slug]`, auth, the `mobile/` Expo app, and all the
marketing/video collateral. This brief is **only** the landing's responsive mobile rendering.
Don't change desktop layout, copy, section order, or tokens unless a checklist item requires it.
