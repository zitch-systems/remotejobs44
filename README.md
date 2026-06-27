# Handoff: RemoteJobs44 — "Deep Ocean" Web (Landing + Jobs + Auth)

## Overview
This package documents the **Deep Ocean** direction for the RemoteJobs44 marketing/web
experience: a worldwide remote-jobs marketplace. It covers five connected pages —
a marketing **landing page**, a **jobs browse** page, a **job detail** page, and
**login** / **signup** pages — all sharing one design system (tokens, type, components)
and one mock data layer.

Positioning: **every genuinely-remote job, worldwide, verified and searchable in one place.**
(Earlier drafts were Africa-specific; this direction is global/remote-first — keep all copy worldwide.)

The bundle includes **two visual directions** built on the same tokens, components, and data:
- **Deep Ocean** (`B*` files) — **the canonical, recommended direction.** Bold dark hero, photo
  backgrounds, live feed window, filter-rail listings, full auth. Build this.
- **Spotlight** (`A*` files) — an **alternate** exploration: warm, light, editorial — a search-first
  hero with a photo-collage and avatar trust row. Included for reference/comparison only; it has
  no auth screens. Both share the same design system, so picking either is a styling choice, not
  a re-architecture. Unless told otherwise, implement **Deep Ocean**.

## About the Design Files
The files in this bundle are **design references created in HTML/CSS/JS** — prototypes that
show the intended look, content, and behavior. **They are not production code to ship as-is.**

The task is to **recreate these designs in the target codebase** using its established stack
and patterns. Per the token file, the production app is **Next.js + Tailwind CSS**
(repo `zitch-systems/remotejobs44`: `app/layout.tsx`, `app/app/globals.css`,
`tailwind.config.js`). Recreate these screens as React components/routes there, mapping the
CSS variables below onto the existing Tailwind theme rather than copying raw CSS. If you build
fresh, React + a tokens layer (CSS vars or Tailwind theme) is the intended target.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions are all specified.
Recreate the UI pixel-accurately using the codebase's component library, then wire it to real
data/endpoints. Exact hex/spacing/type values are in **Design Tokens** below.

---

## Screens / Views

### 1. Landing page  (`Landing B.html`)
Marketing home. Top-to-bottom section order (this order is intentional — it controls the
light/dark "band rhythm"):

1. **Hero** (dark) — full-bleed background **photo** (`assets/hero-videocall-sm.jpg`) under a
   *directional* navy scrim (darker left for text, lighter right so the photo shows behind the
   product window). Left column: eyebrow pill ("70,000+ live remote roles · 150+ countries
   hiring"), H1 **"The world's _remote_ jobs. One search. Apply from anywhere."** ("remote" is
   the accented `<em>`), lede, a white search bar (icon + input + primary button), trending
   chips, and a 3-up stat row (**70k+ / 150+ / 10+**) that **counts up** when scrolled into view.
   Right column: a "browser" **preview window** whose feed of job rows **auto-scrolls vertically**,
   plus a small floating photo card ("Hired remotely this week").
2. **Company logo marquee** (app bg) — two rows of real company logos scrolling in opposite
   directions (see **Logo strategy**). Caption: "70,000+ roles from the companies defining
   remote work — indexed in one place".
3. **Differentiator 3-up** (tint) — "How we're different → Three checks every listing passes":
   cards _Verified / Transparent / Fast_, each with a mini UI mock (green-tick signal rows, a
   salary-range bar, a one-click-apply button).
4. **Listings** (app) — sticky filter rail (Category/Region/Type checkboxes) + live-filtering
   job list; search box filters rows in real time; hero search drives this filter too.
5. **Categories grid** (tint) — 8 category tiles with icon + open-role count.
6. **Featured** (app) — richer job cards (`.fcard`).
7. **Live market wall** (dark) — **Auxia-inspired**: 4 columns of job cards streaming vertically
   at different speeds/directions; pause on hover; respects reduced-motion.
8. **Mission** (tint) — "Talent is everywhere. Opportunity should be too." + 4 stat cards
   (150+ / 70K+ / 100% / 24-7).
9. **How it works** (app) — 3 steps; step 2 shows price pills **Day Pass · $3** / **Pro · $19/mo**.
10. **Capabilities grid** (tint) — "Everything you need to land the role": 6 tiles
    (Daily job alerts, Saved searches, One-click apply, Application tracker, Salary insights,
    Verified employers) + a stat line (70,000+ / 100% verified / Free forever).
11. **Testimonials** (app) — 3 quote cards with member photo + 5 stars.
12. **FAQ** (tint) — 4 `<details>` accordions (plus icon rotates to ×).
13. **CTA band** (dark) — "Your next role is already posted" + primary/ghost buttons.
14. **Footer** — 4-column link grid + social icons + bottom bar.

### 2. Jobs browse  (`B Jobs.html`)
- **Hero band** (dark, photo `assets/ig-duo-laptops.jpg` + scrim): breadcrumb, H1
  "Search 70,000+ remote roles", white search bar, and a stat row
  (70,000+ live roles · 150+ countries hiring · 10+ categories · ● Updated daily).
- **Results** (app): sticky filter rail (Category / Region / Type — Region options are
  Worldwide / **Remote-first** / EMEA) + toolbar ("Showing N of 70,000+ jobs", Sort) + job list
  + numbered pager.

### 3. Job detail  (`B Job.html`)
- **Hero band** (dark, photo `assets/ig-focused-desk.jpg` + scrim): breadcrumb, the company's
  **real logo** in a white tile (Vercel, with monogram fallback), H1 role title, company · location ·
  Featured flag, meta chips (type / location / posted / salary), and an apply/save/share action row.
- **Body** (app): 2-column — `.prose` article (About the role, What you'll do, requirements,
  Skills tag row, About company) + sticky aside (salary card with apply CTA, company card,
  "Similar roles" list built from data).

### 4. Login  (`B Login.html`)  &  5. Signup  (`B Signup.html`)
Split-screen auth (collapses to single column < 880px; aside hides on mobile):
- **Left brand panel** (dark ocean gradient over a photo + scrim): brand, eyebrow pill, headline,
  3 verified-benefit checks, and social proof — login uses a member quote
  (`assets/people-4-portrait.jpg`, photo `hero-videocall-sm.jpg`); signup uses a live-stat row
  (photo `ig-high-five.jpg`; **signup scrim is intentionally darker — 0.90/0.93/0.96 alphas —
  because that photo is brighter; do not lower it or the text loses contrast**).
- **Right form panel**: theme toggle (top-right), Google + GitHub buttons, an "OR" divider,
  inputs with leading icons + focus ring; password field has a show/hide eye toggle.
  - Login: Email, Password, "Remember me" checkbox + "Forgot password?", primary "Log in →".
  - Signup: Full name, Email, Password (8+ chars, hint text), required Terms checkbox,
    primary "Create account →".
  - Both cross-link (login ⇄ signup); submitting either navigates to the jobs page (placeholder
    for real auth).

### Direction A — Spotlight  (`Landing A.html`, `A Jobs.html`, `A Job.html`) — alternate
Same design system and data, different art direction: **light/warm and search-first** rather than
the dark Deep Ocean hero. Use only if you choose this direction over Deep Ocean.
- **Landing A** — hero with a headline + big search box + trending chips, an **avatar trust row**
  (overlapping member photos + "5k+"), and a **photo-collage** hero visual (`assets/ad-orange-woman.jpg`
  in a frame with floating "140 new jobs today" cards). Then a company logo marquee, listings,
  categories, the same Mission/How-it-works/CTA/footer beats as Deep Ocean (worldwide copy, $ pricing).
- **A Jobs / A Job** — the same browse + detail screens as Deep Ocean B, in the Spotlight skin
  (lighter band, no dark photo hero). No login/signup screens exist for Spotlight — reuse the
  Deep Ocean auth pages, or restyle them to match if Spotlight is chosen.

---

## Interactions & Behavior
- **Theme toggle**: light/dark via `data-theme="dark"` on `<html>`, persisted to `localStorage`
  key `rj44-theme-b`. All tokens have dark-mode values. (`initTheme()` in `shared.js`.)
- **Live search filter**: typing filters rendered job rows by title/company/category and updates
  the visible count. (`wireSearch()`.) On the landing, the hero search mirrors into the listings
  filter, and trending/category chips set the query.
- **Count-up stats**: hero stat numbers animate 0 → target on scroll-into-view via
  IntersectionObserver, cubic ease-out, ~1.2s; skipped under `prefers-reduced-motion`.
  (`countUp()`; markup uses `data-count` + `data-suffix`.)
- **Marquees / live wall**: pure-CSS keyframe translation; duplicated track for a seamless loop;
  pause on hover; `animation: none` under reduced motion.
- **Hero entrance**: staggered fade-up (`@keyframes heroRise`) on hero children, gated on
  `prefers-reduced-motion: no-preference` so print/PDF/reduced-motion show the final state.
- **Filter checkboxes**: toggle an `.on` class (brand fill + check).
- **FAQ**: native `<details>/<summary>`; the "+" glyph rotates 45° when `[open]`.
- **Password reveal**: button toggles input `type` between `password`/`text`.
- **Responsive**: hero/listing grids collapse to 1 column < 960px; auth to 1 column < 880px;
  live wall drops to 2 cols < 960px and 1 col < 520px; hero floating photo hidden < 520px.

## State Management
Prototype state is all client-side and ephemeral; in production wire to real data/services:
- `theme`: 'light' | 'dark' (persisted).
- `query` / active filters → server-side job search & counts.
- `savedJobs`, `appliedJobs`, `applicationStatus` (tracker), `alerts`/`savedSearches`.
- `auth`: session/user; the login & signup forms are placeholders — connect to the real auth
  provider and redirect to the dashboard/jobs on success.
- Job listings, featured picks, company logos, and "similar roles" come from the **mock data
  layer** below; replace with real API calls.

---

## Design Tokens
All values are CSS custom properties in `colors_and_type.css`. Map these to the Tailwind theme.

**Typeface**
- Display: **Sora** (`--font-display`) — H1–H5, buttons, numbers. Weights 100–800; UI uses 700/800.
- Body: **DM Sans** (`--font-body`) — paragraphs, inputs, meta.
- Mono: system mono (`--font-mono`) — URLs, code, eyebrow micro-labels.
- Fonts are bundled TTFs in `/fonts` (Sora + DM Sans variable). DM Sans glyphs include ₦ (U+20A6).

**Brand — "Deep Ocean" blue**
`50 #eff6ff · 100 #dbeafe · 200 #bfdbfe · 300 #93c5fd · 400 #60a5fa · 500 #3b82f6 ·
600 #2563eb (primary action/links/focus) · 700 #1d4ed8 (hover, heavy text) · 800 #1e3a5f ·
900 #0f1e38 · 950 #060e1f`. Dark-hero gradients use `#0c1d3a → #0a1628 → #060e1f`.

**Accent — "Sunrise orange"**: `--accent #f97316` (logo dot, featured stripe, saved icon),
`--accent-light #fbbf46`, `--accent-dark #d48a0a`.

**Neutrals / surfaces (light → dark)**
- bg-app `#f8faff → #0a1628` · bg-section `#f1f5f9 → #0f1e38` · bg-card `#ffffff → #111c35`
- border-1 `#e8edf5 → #1e2d4a` · border-2 `#e2e8f0 → #1e3a5f` · border-3 `#f1f5f9 → #0f1e38`
- fg-1 `#0f172a → #e2e8f4` · fg-2 `#475569 → #cbd5e1` · fg-3 `#64748b → #94a3b8` ·
  fg-4 `#94a3b8 → #64748b` · fg-5 `#cbd5e1 → #334155`

**Semantic**: success `#1ea05e` (bg `#edfaf2`) · warning `#f59e0b` (bg `#fef3c7`) ·
danger `#ef4444` (bg `#fee2e2`) · info = brand-600.

**Type ramp**: 2xs 10 · xs 11 · sm 13 · base 15 · md 17 · lg 20 · xl 24 · 2xl 30 · 3xl 38 ·
4xl 50 · 5xl 64 (px). Line-heights: tight 1.05 / snug 1.15 / normal 1.5 / relaxed 1.6 / loose 1.75.
Weights: 300/400/500/600/700/800. Tracking: tight −0.02em / wide 0.06em / wider 0.1em.

**Radii**: xs 4 · sm 6 · md 10 · lg 16 · xl 24 · 2xl 32 · pill 9999 (px).

**Shadows (blue-tinted)**: sm `0 1px 4px rgba(37,99,235,.06)` · md `0 4px 20px rgba(37,99,235,.16)` ·
lg `0 8px 32px rgba(37,99,235,.18)` · xl `0 16px 56px rgba(37,99,235,.22)`.

**Spacing (4px base)**: 1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 · 16=64.

**Layout**: container-max 1440 · header-height 68 · bottom-nav-height 68 (px).
**Motion**: ease-spring `cubic-bezier(.34,1.56,.64,1)` · durations fast 150 / normal 200 / slow 300 ms.

---

## Mock Data Layer  (`shared.js`)
Replace with real APIs; the shape is a useful contract.
- **`JOBS[]`** — `{ title, company, cat, region, pay, type, age, featured }`. Drives the listings,
  featured cards, hero preview, live wall, and "similar roles".
- **`COMPANIES[]`** — 50 company names for the logo marquee.
- **`LOGO_TINTS` / `CAT_TINT`** — pastel `[bg, fg]` pairs used to tint monogram avatars/category tags.
- Render helpers: `monogram()`, `logoChipsHTML()`/`mountMarquee()`, `jobRowHTML()`/`mountJobs()`,
  `featuredCardHTML()`/`mountFeatured()`, `mountLiveWall()`, `wireSearch()`, `wireChips()`,
  `countUp()`, `initTheme()`.

## Logo strategy (real company logos)
Company marks are fetched from public sources at render time, with a fallback chain:
1. **Simple Icons** CDN — `https://cdn.simpleicons.org/<slug>` (crisp vector; used for most tech brands).
2. **DuckDuckGo** icon service — `https://icons.duckduckgo.com/ip3/<domain>.ico` (covers everything else, incl. fintechs).
3. **Tinted monogram** fallback if both fail (`onerror` → `brandImgFail()`).
`BRAND_SLUG` (Simple Icons slugs) and `BRAND_DOMAIN` (domains) maps live in `shared.js`.
In dark mode, logo `<img>`s sit on a small white rounded tile so any-color marks stay legible.
**For production**: prefer self-hosting approved partner logos / using a licensed logo API rather
than hot-linking these services, and confirm usage rights for any company marks shown.

## Assets
In `assets/` (used by these pages). All photos are JPEGs; downscaled for web.
- `hero-videocall-sm.jpg` — landing hero background + login brand-panel background.
- `ig-duo-laptops.jpg` — jobs-browse hero background.
- `ig-focused-desk.jpg` — job-detail hero background.
- `ig-high-five.jpg` — landing floating card + signup brand-panel background.
- `people-4-portrait.jpg`, `ad-blazer-man.jpg`, `ad-coffee-woman.jpg` — testimonial / quote portraits.
- Company logos are **remote** (Simple Icons / DuckDuckGo, see above) — none are bundled here.
- Icons throughout are inline **Feather-style** stroke SVGs (`stroke-width` ~2, round caps).
- Replace stock photography with licensed/owned imagery before shipping.

## Files in this bundle
- `Landing B.html` · `B Jobs.html` · `B Job.html` · `B Login.html` · `B Signup.html` — **Deep Ocean** (build this).
- `Landing A.html` · `A Jobs.html` · `A Job.html` — **Spotlight** alternate direction (reference).
- `colors_and_type.css` — design tokens, fonts, base element styles (**start here**).
- `components.css` — shared component classes (header, buttons, job rows/cards, marquee, filter
  rail, footer, prose, detail page, etc.).
- `shared.js` — mock data + render/interaction helpers.
- `assets/` — photography used by the screens.
- Paths in the copied HTML were flattened (`colors_and_type.css`, `components.css`, `assets/…`)
  so each file opens standalone in a browser for reference.

> Note: the live, working versions (with the project's original relative paths) live in the
> project's `redesign/` folder. This folder is a flattened, self-contained reference copy.
