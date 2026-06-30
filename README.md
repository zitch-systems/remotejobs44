# CLAUDE.md — RemoteJobs44 full implementation guide

> For **Claude Code**. This is the authoritative, self-sufficient spec for rebuilding the
> **entire RemoteJobs44 product** — the marketing site, the signed-in member web app, and the
> mobile app — from the HTML/CSS/JS design references in this bundle. Read it fully before
> writing code. Where any older note disagrees, **this file and the actual design files win.**

---

## 0. What you're building

**RemoteJobs44** is a worldwide remote-jobs marketplace: *every genuinely-remote job, verified
and searchable in one place.* Positioning is **global / remote-first** — keep all copy
worldwide ("70,000+ live remote roles · 150+ countries hiring"). Do **not** reintroduce any
region-specific framing, and do **not** reference Greenhouse or Glassdoor anywhere.

Three product surfaces, one design system (`tokens/`):

| Surface | What it is | Design files |
|---|---|---|
| **Marketing web** | Public, logged-out site that converts visitors → sign-ups | `design_files/web/Deep Ocean Landing Desktop.html`, `B Jobs.html`, `B Job.html`, `B Login.html`, `B Signup.html` |
| **Member web app** | Signed-in dashboard + job-hunt tools (sidebar shell) | `design_files/web/Member Dashboard Desktop.html` + 10 more (see §6) |
| **Mobile app** | Installable PWA / React-Native member app | `design_files/app/` (vanilla-JS PWA), `design_files/native/` (Expo RN) |

All three share **one token layer** — colors, type, spacing, radii, shadows, motion — defined
in `tokens/colors_and_type.css`. Build them so they read from the same theme.

### Art directions
- **Deep Ocean** (the `B*` / "Deep Ocean" / member screens) is **canonical — build this.**
- **Spotlight** (`Landing A.html`, `A Jobs.html`, `A Job.html`) is an **alternate** light/warm
  exploration on the same tokens. **Reference only — do not build** unless explicitly asked.

---

## 1. These files are design references, not shippable code

The HTML/CSS/JS here are **prototypes that show the intended look, copy, data shape and
behavior** — not code to paste in. Recreate them in the target stack and conventions.

**Target stack (web): Next.js (App Router) + Tailwind CSS**, repo `zitch-systems/remotejobs44`
(`app/layout.tsx`, `app/app/globals.css`, `tailwind.config.js`). If you're in that repo, **map
the tokens in §4 onto its Tailwind theme** rather than copying raw CSS. If starting fresh,
`create-next-app --ts --tailwind --app`.

**Target stack (mobile):** a React-Native (Expo) starting point already exists at
`design_files/native/` — build there if the target is native. If the mobile experience ships
as a **responsive PWA** instead, the marketing landing is already responsive and the member app
maps cleanly onto React components.

**Fidelity: high.** Colors, type, spacing, radii, shadows, copy, and interactions are final —
match them. Lift exact values from `tokens/colors_and_type.css` (tokens) and
`tokens/components.css` (web component styles); read `design_files/web/shared.js` and
`design_files/app/data.js` for the data shape.

---

## 2. Recommended repo structure

A monorepo keeps the shared token layer honest:

```
remotejobs44/
  apps/
    web/                      # Next.js (App Router) — marketing + member app
      app/
        layout.tsx            # <html> + fonts + ThemeProvider; imports globals.css
        globals.css           # Tailwind base + the CSS custom properties from §4
        (marketing)/
          page.tsx            # Landing
          jobs/page.tsx       # Public browse
          jobs/[slug]/page.tsx
          login/page.tsx
          signup/page.tsx
        (member)/
          layout.tsx          # Member shell: TopBar + Sidebar (see §5b)
          dashboard/page.tsx
          browse/page.tsx
          saved/page.tsx
          applications/page.tsx
          jobs/[slug]/page.tsx
          match/page.tsx
          interview/page.tsx
          cv/page.tsx
          cover-letters/page.tsx
          profile/page.tsx
          alerts/page.tsx
      components/{layout,landing,jobs,member,ui}/…
      lib/{jobs.ts,logos.ts,api.ts,hooks}/…
    mobile/                   # Expo RN (port design_files/native/) — or skip if PWA
  packages/
    tokens/                   # the shared design tokens (from tokens/) as TS + CSS vars
    ui/                       # shared primitives if you want web/native parity
```

Use **Server Components** for static marketing sections; add `"use client"` only where there's
state/effects (theme toggle, count-up, marquees, live filtering, FAQ, password reveal, the
member-app interactive tools).

---

## 3. Two shells, eleven member screens, one design system

There are exactly **two chrome patterns**. Build each once, reuse everywhere.

- **Marketing shell** — top `site-header` (logo · nav · theme toggle · Sign in · Sign up) and a
  4-column `site-footer`. Wraps the landing + public jobs/detail. Auth pages use neither
  (split-screen).
- **Member shell** — fixed **top bar** (logo · global search · theme toggle · notifications ·
  user) + left **sidebar** nav. Wraps all 11 signed-in screens. See §5b for the exact spec.

---

## 4. Design tokens → Tailwind theme

All values live in **`tokens/colors_and_type.css`** as CSS custom properties (every token has a
`[data-theme="dark"]` value). Copy that block into `globals.css` under `:root` / `[data-theme="dark"]`,
then expose via Tailwind `theme.extend`.

**Typefaces** — Display **Sora** (`--font-display`; H1–H5, buttons, numbers; weights 700/800),
Body **DM Sans** (`--font-body`), Mono = system (`--font-mono`). Variable TTFs are bundled in
`design_files/web/fonts/` (Sora + DM Sans, incl. italic; glyphs include ₦ U+20A6). Prefer
`next/font/local` → expose as `--font-display` / `--font-body`. Also on Google Fonts.

**Brand — "Deep Ocean" blue**
`50 #eff6ff · 100 #dbeafe · 200 #bfdbfe · 300 #93c5fd · 400 #60a5fa · 500 #3b82f6 ·
600 #2563eb` (primary action / links / focus) `· 700 #1d4ed8` (hover, heavy text) `·
800 #1e3a5f · 900 #0f1e38 · 950 #060e1f`. Dark-hero gradient `#0c1d3a → #0a1628 → #060e1f`.
`--brand` = 600 in light, **500 in dark**.

**Accent — "Sunrise orange"** `--accent #f97316` (logo dot, featured stripe, saved icon) ·
`--accent-light #fbbf46` (hero emphasis / dark `<em>`) · `--accent-dark #d48a0a`.

**Surfaces (light → dark)**
- `--bg-app #f8faff → #0a1628` · `--bg-section #f1f5f9 → #0f1e38` · `--bg-card #ffffff → #111c35`
- `--border-1 #e8edf5 → #1e2d4a` · `--border-2 #e2e8f0 → #1e3a5f` · `--border-3 #f1f5f9 → #0f1e38`
- `--fg-1 #0f172a → #e2e8f4` · `--fg-2 #475569 → #cbd5e1` · `--fg-3 #64748b → #94a3b8` ·
  `--fg-4 #94a3b8 → #64748b` · `--fg-5 #cbd5e1 → #334155`

**Semantic** success `#1ea05e` (bg `#edfaf2`) · warning `#f59e0b` (bg `#fef3c7`) ·
danger `#ef4444` (bg `#fee2e2`) · info = brand-600. (App also uses success `#22c55e`.)

**Category logo tints** (light bg / fg used on monogram tiles & category tags):
Engineering `#eff6ff/#2563eb` · Design `#faf5ff/#9333ea` · Marketing `#fdf2f8/#db2777` ·
Data `#ecfeff/#0891b2` · Support `#fff7ed/#ea580c` · Sales `#fef2f2/#dc2626` ·
Product `#eef2ff/#4f46e5` · VA `#f0fdf4/#16a34a`. The app uses gradient versions (`GRADS` in
`design_files/app/data.js`).

**Type ramp (px)** 2xs 10 · xs 11 · sm 13 · base 15 · md 17 · lg 20 · xl 24 · 2xl 30 · 3xl 38 ·
4xl 50 · 5xl 64. **Line-heights** tight 1.05 / snug 1.15 / normal 1.5 / relaxed 1.6 / loose 1.75.
**Weights** 300/400/500/600/700/800. **Tracking** tight −0.02em / wide 0.06em / wider 0.1em.
H1 = 4xl (≈23px on mobile) · H2 = 2xl · H3 = xl.

**Radii (px)** xs 4 · sm 6 · md 10 · lg 16 (nav/panels) · xl 24 · 2xl 32 · pill 9999.
Cards land at ~14–18px in practice; auth card / bottom sheet 28px.

**Shadows (blue-tinted)** sm `0 1px 4px rgba(37,99,235,.06)` · md `0 4px 20px rgba(37,99,235,.16)` ·
lg `0 8px 32px rgba(37,99,235,.18)` · xl `0 16px 56px rgba(37,99,235,.22)`. (App shell:
`0 10px 30px -16px rgba(15,30,56,.25)`.)

**Spacing** 4px base (1=4 … 16=64). **Layout** container-max 1440 · header 68 · bottom-nav 68 ·
member sidebar ~230px · member filter rail 230px. **Hit targets** ≥44px (mobile).

**Motion** `--ease-spring cubic-bezier(.34,1.56,.64,1)`; durations fast 150 / normal 200 /
slow 300 ms. Honor `prefers-reduced-motion` everywhere.

---

## 5. Marketing web — screen specs

### 5a. Marketing shell
- **Header** (`.site-header`, height 68): brand = gradient rounded tile (linear `#2563eb→#1e3a5f`)
  with a white **squiggle** mark + **orange dot** (`#f97316`), wordmark **RemoteJobs**`44`
  (the `44` is accent). Nav links: **Browse Jobs · Categories · Companies · How It Works**
  (hide ≤880px). Right: **theme toggle** (moon/sun, `aria-pressed`), **Sign in** (ghost),
  **Sign up** (primary; "Sign up _now_" suffix hides ≤520px).
- **Footer** (`.site-footer`): 4-column link grid + social icon row + bottom bar
  (copyright / legal). Collapses to stacked groups on mobile.

### 5b. Landing  (`Deep Ocean Landing Desktop.html` → `/`)
One long scrolling document, **desktop-first with mobile breakpoints** (960/880/640/520/340).
Section order is intentional (light/dark band rhythm). Each `<section>` has a `data-screen-label`.

1. **Hero** (dark; full-bleed `assets/hero-videocall-sm.jpg` under a directional navy scrim +
   dot-grid `::after`; follows theme — lighter scrim in light mode). Left column: eyebrow pill
   **"70,000+ live remote roles · 150+ countries hiring"**; H1 **"The world's _remote_ jobs. One
   search. Apply from anywhere."** (the `<em>` "remote" = brand-700 / accent-light in dark, and
   **flips in on a 3D X-axis**); lede; **white search bar** (search icon + input + primary
   "Search Jobs" → `/jobs`); **trending chips** (Engineering / Design / Data & AI / Marketing →
   `/jobs?cat=`); **3-up stat row 70k+ / 150+ / 10+** that **counts up** from 0. The flip +
   count-up **replay together on a 5–8s loop** (paused when tab hidden or hero off-screen; word
   also flips on hover/click). Right column: a **"browser" preview window** whose job feed
   **auto-scrolls vertically**, plus a floating **"Hired remotely this week"** photo card. The
   header brand `<svg>` icon does a continuous gentle **3D nod** (`rotateX ±34°`, scoped to the
   glyph — never the wordmark).
2. **Companies marquee** (`.band`) — caption **"70,000+ roles from the companies defining remote
   work — indexed in one place"** + two logo rows scrolling opposite directions. *Hidden ≤640px.*
3. **Why we're different** (tint) — kicker "How we're different", H2 **"Three checks every
   listing passes"**, sub "Most boards quietly bury roles that secretly want you on-site…", three
   cards **01 Verified / 02 Real / 03 Direct**, each with a decorative mini-UI mock (hidden on
   mobile).
4. **Browse by category** (tint) — kicker "Browse by category", H2 **"Wherever your skills are,
   there's a remote role"**, 8 category tiles w/ icon + open-role count (stays 3-up on mobile).
5. **Featured this week** (app) — kicker "Featured this week", H2 **"Roles our team is excited
   about"**, rich featured job cards (`.fcard`).
6. **Live market wall** (`.livewall`, dark) — kicker "Live market", H2 **"Thousands of roles,
   moving in real time"**, 4 columns of job cards streaming vertically at different speeds; pause
   on hover; reduced-motion safe. *Hidden ≤640px (→ relocated Live feed, §14).*
7. **Mission** (tint) — kicker "Why RemoteJobs44", H2 **"Talent is everywhere. Opportunity should
   be too."** + 4 stat cards. *Hidden ≤640px.*
8. **How it works** (app) — kicker "How it works", H2 **"From browse to offer letter — in three
   steps"**; 3 numbered steps; step 2 shows price pills **Day Pass · $3** / **Pro · $19/mo**.
9. **Pricing** (`#pricing`, tint) — kicker "Simple pricing", H2 **"Apply free. Pay only to
   unlock."**, 3 tiers. *Swipe carousel on mobile (scroll-snap).*
10. **Toolkit / capabilities** (tint) — kicker "The RemoteJobs44 toolkit", H2 **"Everything you
    need to land the role"**, 6 capability tiles (Daily job alerts, Saved searches, One-click
    apply, Application tracker, Salary insights, Verified employers).
11. **Testimonials** (app) — kicker "Hired through RemoteJobs44", H2 **"Real offers. Real
    paychecks. From home."**, 3 quote cards (member photo + 5 stars). *Swipe carousel on mobile.*
12. **FAQ** (tint) — kicker "Questions", H2 **"Everything you need to know"**, `<details>/<summary>`
    accordion (+ rotates to × on open).
13. **CTA band** (dark) — eyebrow "Join 5,000+ job seekers", H2 **"Your next role is already
    posted"** + primary/ghost actions.
14. **Live feed** (app) — kicker "Live right now", H2 **"Fresh remote roles, posted every
    minute"** — the relocated auto-scrolling preview window (max ~460px), centered.
15. **Footer.**

### 5c. Public jobs browse  (`B Jobs.html` → `/jobs`)
Dark hero band (photo `assets/ig-duo-laptops.jpg` + scrim): breadcrumb, H1 **"Search 70,000+
remote roles"**, white search bar, stat row (70,000+ live roles · 150+ countries · 10+ categories
· ● Updated daily). Body (app bg): sticky **filter rail** (Category / Region [Worldwide /
Remote-first / EMEA] / Type) + toolbar ("Showing N of 70,000+ jobs", Sort) + job list + numbered
pager. **Search/filter is live & client-side.**

### 5d. Public job detail  (`B Job.html` → `/jobs/[slug]`)
Dark hero band (photo `assets/ig-focused-desk.jpg`): breadcrumb, the company's **real logo** in a
white tile (Vercel, monogram fallback), H1 role title, company · location · Featured flag, meta
chips (type / location / posted / salary), apply/save/share row. Body: 2-column — `.prose`
article (About the role / What you'll do / What we're looking for / Skills tag row / About
company) + sticky aside (salary card `$120k–$160k / year` + apply CTA, company card, "Similar
roles" from data).

### 5e. Auth — Login (`B Login.html` → `/login`) & Signup (`B Signup.html` → `/signup`)
Split screen (collapses to 1 column < 880px; aside hides on mobile).
- **Left brand panel** (dark ocean gradient over a photo + scrim): brand, eyebrow pill, headline,
  3 verified-benefit checks, social proof. Login = member quote (`people-4-portrait.jpg`, bg
  `hero-videocall-sm.jpg`); Signup = live-stat row (bg `ig-high-five.jpg`; **signup scrim is
  intentionally darker — 0.90/0.93/0.96 alphas — because that photo is brighter; do not lighten
  it**).
- **Right form panel**: theme toggle (top-right), **Google + GitHub** buttons, an **OR** divider,
  inputs with leading icons + brand focus ring; password field has a **show/hide eye** toggle.
  Login: Email, Password, "Remember me" + "Forgot password?", primary **"Log in →"**. Signup:
  Full name, Email, Password (8+ chars hint), required **Terms** checkbox, primary **"Create
  account →"**. Cross-link login ⇄ signup; submit → `/jobs` (placeholder — wire to real auth).

---

## 6. Member web app — screen specs

> All 11 screens render inside the **Member shell**. Demo identity throughout: **Ada Obi**,
> "Virtual Assistant · Remote · Lagos, NG", avatar `assets/people-4-portrait.jpg`.

### 6a. Member shell  (build once as `(member)/layout.tsx`)
- **Top bar** (`.topbar`): brand (logo tile + RemoteJobs**44** → dashboard) · centered **global
  search** box ("Search remote jobs…") · right cluster: **theme toggle** (persists to
  `localStorage` `rj44-theme-dash`), **notification bell** with count badge (`3`), user **name
  "Ada Obi"** + **avatar**.
- **Sidebar** (`.sidebar`, ~230px, grouped with `.nav-label`s):
  - **Menu** — Dashboard · Browse Jobs `[12]` · Saved Jobs · Applications `[4]`
  - **Tools** — CV Builder · Cover Letters · AI Interview · Job Match
  - **Account** — Profile · Alerts `[3]`
  - footer — **Sign out** (→ `/login`)
  Each item = inline-SVG icon + label; active item uses brand fill/tint; some carry a `.nbadge`
  count. Icons are Feather/Lucide-style 2px strokes — map to Lucide.

### 6b. Dashboard  (`Member Dashboard Desktop.html` → `/dashboard`)
- **Alert banner** (brand-tinted): ⚡ icon + **"12 new roles match your saved search"** /
  "Engineering · Remote · Senior — updated this morning" + **Browse now** button.
- **Greeting**: H1 **"Good morning, Ada 👋"**, "You have 4 active applications and 3 interviews to
  prepare for this week." + actions **Browse jobs** (ghost) / **Upload new CV** (primary).
- **Stat row** — 4 cards (icon tile + number + label + delta): **Active applications 4** (↑2 this
  week) · **Interviews scheduled 3** (↑1 new invite) · **Saved jobs 18** (5 still open) ·
  **Profile strength 78%** (progress bar). Numbers count up on mount.
- **Two-column grid**:
  - *Left* — sec-head **"Application tracker"** + "View all →"; a card with 5 **app-rows** (logo
    tile, role, company · location, **status pill**). Status pills: `Applied` (brand tint),
    `Interview` (accent tint), `Offer 🎉` (success tint), `Saved` (neutral). Sample rows: Senior
    Frontend Engineer · Vercel — Interview; Product Designer · Stripe — Applied; Growth Marketing
    Lead · Andela — Interview; Full-Stack Engineer · Shopify — Offer; Staff Engineer · GitHub —
    Saved.
  - *Right* — **CV strength** ring (78%, with improvement tips) · **tools quick-launch** rows
    (icon + name + desc + arrow → CV Builder / Cover Letter / AI Interview) · top **job-match**
    rows (role + company + match %).

### 6c. Browse Jobs  (`Browse Jobs.html` → `/browse`)
Header **"Browse Jobs"** / "70,000+ verified remote roles · refreshed every minute." Layout =
`230px` sticky **filter rail** + results.
- **Rail** (`.rail`): h4 "Filters", `.fgroup`s **Category / Region / Type** with checkbox rows
  (toggle an `.on` class → brand fill + check).
- **Results**: results-head — `● 1,284 matching roles` (success pulse dot) + "Sorted by: Newest
  first". `.jlist` of **job cards** (`.jcard`): logo tile (category tint + monogram), role (h3),
  company · region, meta chips (level / category / posted), pay, **save** toggle (accent when on).
  Collapses to 1 column < 820px.

### 6d. Saved Jobs  (`Saved Jobs.html` → `/saved`)
Header **"Saved Jobs"** / "18 roles bookmarked — 5 still open, 13 closed or filled." **Filter
chips** (`.sj-filter`): All saved · 18 (on) / Still open · 5 / Engineering · 9 / Design · 4 /
Marketing · 3. **Grid** of `.scard`s: logo tile, role (h3), company · region, **save toggle**
(filled bookmark, "Remove from saved"), meta, pay. Empty state when none.

### 6e. Applications  (`Applications.html` → `/applications`)
Header **"Applications"** / "Track every role from saved to offer — 13 active across 4 stages."
**Kanban board** = 4 columns **Saved → Applied → Interview → Offer**, each a `.col` with a count
and a `.col-body` of `.jcard`s (logo, role h3, company, meta chips, footer pay + relative date;
Interview/Offer cards add a `.jcard-note` line e.g. "Interview scheduled" / success "Offer
received"). This is the desktop counterpart of the mobile "Applied" tab.

### 6f. Member Job Detail  (`Job Detail.html` → `/jobs/[slug]`)
In-shell job page. `jd-topbar` breadcrumb (Browse Jobs › role). `jd-body` 2-column:
- **Main** (`.jd-main`): `jd-hero` (logo tile "V", H1 **"Senior Frontend Engineer"**, "Vercel ·
  Remote Worldwide"); `.prose` — **About the role / What you'll do / What we're looking for /
  Compensation & benefits** (e.g. "$180,000 – $230,000 base salary (location-adjusted)").
- **Aside** (`.jd-aside`): **"Your match score"** card — **85% "Strong match"** + match bar;
  **"Job details"** card (Company / Level / Type / Region / Posted rows); apply / save actions.

### 6g. Job Match  (`Job Match.html` → `/match`)
`jm-topbar` H1 **"Job Match"** + **"Analyse new JD"** button. `jm-body` two-pane:
- *Left* — "Paste job description" label + large textarea.
- *Right* — a **score** gauge with "Your CV covers 17 of 20 required signals"; then `.jm-sec`
  blocks: **Matched keywords (12 matched)** [green `.kw.match`], **Gaps to address (3 missing)**
  [red `.kw.gap`], **Partial matches (2 partial)** [accent `.kw.partial`], and **"How to win this
  one"** with `.tip-row`s (icon + advice).

### 6h. AI Interview  (`AI Interview.html` → `/interview`)
`ai-topbar` H1 **"AI Interview"** + a live **timer** ("● 04:32") + controls. `ai-body` two-pane:
- *Left* `.q-panel`: session chips (**Senior Frontend Engineer · Vercel · Technical**); current
  `.q-card` (q-num "Question 3 · System Design", q-text the question, q-hint tip); **past
  questions** (`.past-q` Q2, Q1 — answered, each with a mini score bar).
- *Right* `.r-panel`: **"Your answer"** card (textarea + actions **🎤 Use voice** / **Submit answer
  →**); **"Live feedback"** score card — big **overall 86** ("Running score · 3 sessions left") +
  score rows **Clarity 88 / Depth 82 / Structure 79 / Keywords 91** (bar colors brand/accent/
  success by band) + a short written critique.

### 6i. CV Builder  (`CV Builder.html` → `/cv`)
`cv-topbar` H1 **"CV Builder"** + tabs **Edit (on) / Preview / Download**. `cv-body` = **editor**
(left, stacked `.esec` form sections — contact, summary, experience, skills, etc.) + **live
preview** (right, an ATS-ready rendered résumé). "ATS-ready" is the promise — keep the preview a
clean single-column document.

### 6j. Cover Letter  (`Cover Letter.html` → `/cover-letters`)
`cl-topbar` H1 **"Cover Letter Generator"** + a **draft** chip. `cl-body` split:
- *Inputs* (`.cl-inputs`): **Role details** (Job title "Senior Frontend Engineer", Company name
  "Vercel", …); **Tone** 2×2 grid — **Professional (on) / Enthusiastic / Concise /
  Conversational**; **Key points to highlight** textarea; primary **Generate** button.
- *Preview* (`.cl-preview`, tint bg): a `.letter-card` — meta line ("To: **Vercel Hiring Team** ·
  Role: **Senior Frontend Engineer** · Tone: **Professional**") + the generated letter body.

### 6k. Profile & Settings  (`Profile.html` → `/profile`)
`pr-topbar` H1 **"Profile & Settings"** + **Save changes**. Tabbed `.tab-panel`s:
- **Profile** — avatar row (`people-4-portrait.jpg`) + identity/headline/skills form fields.
- **Notifications** — toggle rows (e.g. **Daily job digest**, new-match alerts, application
  updates) using `.toggle` switches.
- **Privacy** — toggle rows (**Show profile to employers**, discoverability, data).
- **Subscription** — `.plan-card` **Pro Plan / Current** + manage/cancel.

### 6l. Alerts  (`Alerts.html` → `/alerts`)
`al-topbar` H1 **"Alerts"** + **Mark all as read**. Tab row (All / Matches / Status / System).
`.al-body` grouped by day ("Today") of `.al-card`s; **unread** rows are accented and clear on
"Mark all as read". (This is the web counterpart of the mobile Notifications screen.)

---

## 7. Mobile app — screen specs

Delivered as a **full-screen single-column app** with a persistent **bottom tab bar** and
iOS-style **stacked navigation** (push/pop, back button on detail screens). Reference impl:
`design_files/app/` (framework-free, maps cleanly to any framework); `design_files/native/`
is the Expo/RN rendition of the same screens + tokens.

- **Tab bar** (64px, hidden on `full` screens): **Home · Search · Applied · Saved · Profile**.
- **Stack router**: tabs reset the stack; **Job Detail** and **Notifications** push; back pops.

**Screens** (full detail in `RemoteJobs44 - Mobile App - Handoff.md`, included in `design_files/`):
1. **Auth** — full-screen dark hero (bg `app/assets/auth-bg.png` + navy scrim) with a white card
   sliding up; segmented **Sign in / Create account**; Full-name shown only in Create mode;
   Email/Password; Google/LinkedIn ghost buttons. Any details log you in → Home.
2. **Home / Feed** — navy hero header (greeting + bell), white **search pill**, **stat trio**
   (Applications / Saved / Profile %, count-up), category chips, "Top matches for you" job list.
3. **Search + Filters** — query input (180ms debounce) + filter dropdowns (Category, Type,
   Experience, Region, Date, Verified, Sort) with an active-count badge; live results + empty
   state.
4. **Job Detail** — dark hero (back/share/save, logo, role, Verified chip, meta chips); body =
   key row (Pay / Match% / Posted), match bar, About / What you'll do, company card; sticky
   **apply bar** → **Apply now ⚡** opens a **bottom sheet** (résumé + profile rows, note,
   Submit) → success state; re-apply blocked.
5. **Applications** (tab "Applied") — stage tracker (Applied / Interview / Offer counts) + status
   cards.
6. **Saved** (tab "Saved") — saved Job Cards + empty state.
7. **Notifications** — match / status / tip rows; marks all read ~800ms after open.
8. **Profile / Settings** (tab "Profile") — header (avatar, name, PRO pill), stat trio,
   **subscription card** (Free→Upgrade / Pro→Manage), CV row, skills chips, account &
   preferences lists (Dark theme / Push / Job-alert-email switches), support, sign out.

Mobile tokens: shell + components in `tokens/app-styles.css` and `tokens/app-screens.css`
(same brand/accent/type as the web). Theme persists to `localStorage` `rj44_app_v1` (full store
shape in §9 of the mobile handoff). PWA via `manifest.webmanifest` + `sw.js` + `icons/`.

---

## 8. Shared components (exact styling)

- **Button** — `.btn-primary` brand-blue fill / white; `.btn-ghost` outlined; sizes `.btn-sm` /
  `.btn-lg`; `.btn-block` full-width; active scales slightly.
- **Job card** (`.jcard` web / app) — card (radius 14–18, soft brand shadow); logo tile (rounded
  ~13px, category tint/gradient bg, company favicon w/ monogram fallback); role (Sora 700,
  ~15.5px), company · category meta, footer chips (pay / region / posted), match %, save/bookmark
  toggle (accent when saved). Featured variant `.fcard` adds an accent top stripe.
- **Status pill** — `Applied` brand-tint / `Interview` accent-tint / `Offer` success-tint /
  `Saved` neutral.
- **Inputs** (`.input` / `.field`) — rounded field, optional leading icon, focus ring
  `0 0 0 4px rgba(37,99,235,.12)` + brand border.
- **Chips / keyword pills** — `.chip`, `.jchip`, `.kw` (match=success / gap=danger /
  partial=accent), `.skill`, `.tone-btn` (`.on` = brand tint).
- **Filter controls** — web checkbox rows toggle `.on`; mobile uses `.fdrop` dropdowns; app
  switch `.switch`/`.toggle` → `.on`.
- **Progress / score** — `.progress-bar > i`, `.match-bar > i`, the CV ring (SVG circle), score
  rows (`.sr-bar > i`). Bars fill to a percentage; color by band (brand < accent < success).
- **Eyebrow pill / badge / kicker** — small uppercase labels (`--tracking-wide/-wider`).
- **Accordion** — native `<details>/<summary>`; "+" rotates 45° → × when `[open]`.
- **Skeletons / toasts / bottom sheet / empty states** — see `tokens/components.css` and the app
  CSS for `.skel`, `.toast`, `.sheet`, `.empty`.

---

## 9. Interactions & behavior

- **Theme** — `data-theme="dark"` on `<html>`, applied before paint; persisted (marketing/member:
  `rj44-theme-b` / `rj44-theme-dash`; app: inside `rj44_app_v1`). Every token has a dark value.
- **Count-up** — hero/dashboard stats animate 0→target (cubic ease-out ~1.7s); on the landing
  they **re-run on a 5–8s loop** with the headline flip (paused when `document.hidden` or hero
  off-screen). Skip under reduced-motion (show final).
- **Headline flip** (landing) — H1 `<em>` "remote" rotates `rotateX(-92°)→0` (~0.9s) via a toggled
  class; on entrance, on the loop, and on hover/click. Static under reduced-motion.
- **Logo 3D nod** (landing header) — brand `<svg>` tips `rotateX ±34°` (in-transform
  `perspective(320px)`, ~4s loop), **icon glyph only**, never the wordmark.
- **Live search/filter** — public `/jobs` and member Browse filter rows by title/company/category
  and update the visible count; the landing hero search/chips carry the query to `/jobs`.
- **Marquees / live wall / live feed** — CSS keyframe translate on a duplicated track; pause on
  hover; `animation:none` under reduced-motion.
- **Hero entrance** — staggered fade-up; make the **final state the base style** and gate the
  animation behind a JS-added attribute + `prefers-reduced-motion: no-preference`, so SSR / print
  / reduced-motion never render an invisible hero.
- **Tool screens** — Job Match analyse, AI Interview submit/score, CV Builder tabs, Cover Letter
  tone toggle + Generate, Profile tabs + toggles, Alerts mark-all-read, Saved filter chips: all
  toggle local state in the prototype; wire to real services.
- **Password reveal** — toggles input `type`. **FAQ** — native details. **Responsive** —
  hero/listing grids → 1 col < 960; auth → 1 col < 880; member rail/browse → 1 col < 820; live
  wall 2 cols < 960 / 1 < 520; floating hero photo hidden < 520; clamp `overflow-x`.

---

## 10. Company logos

Marks are **full-colour**, fetched at render with a fallback chain: **Google favicon**
`https://www.google.com/s2/favicons?domain=<domain>&sz=128` → **DuckDuckGo**
`https://icons.duckduckgo.com/ip3/<domain>.ico` → tinted **monogram**. Web: `BRAND_DOMAIN` in
`design_files/web/shared.js`, each `<img>` carries a pipe-delimited `data-fallback` walked by
`brandImgFail()`. App: `COMPANIES`/`logoFor()` in `design_files/app/data.js` (SimpleIcons
`cdn.simpleicons.org/<icon>` or DDG favicon, monogram fallback). Marks render ~34px (38px on a
white tile in dark mode). **For production: self-host approved partner logos or use a licensed
logo API, and confirm usage rights — do not hot-link these services at scale.**

---

## 11. Data & API

The prototypes use an in-memory mock with the same shape a real backend should return. Port it to
typed `lib/jobs.ts` and put the network calls behind one seam (`API.*` today → `fetch()`
tomorrow). **Full types and proposed REST endpoints are in `api.md`.** Seed data lives in
`design_files/app/data.js` (12 roles, 8 categories, 12 companies) and
`design_files/web/shared.js` (50 marquee companies, render helpers).

---

## 12. Build order

1. **Tokens + fonts** — port `tokens/colors_and_type.css` vars into `globals.css`, wire Tailwind
   `theme.extend`, set up Sora + DM Sans, add `ThemeProvider` + `ThemeToggle`.
2. **Primitives + data** — `Button`, `Pill`, `Badge`, `Input`, `JobCard`, `SearchBar`, status
   pills; `lib/jobs.ts` + `lib/logos.ts` + the `api.ts` seam.
3. **Marketing shell** (`Header`/`Footer`) → **Landing** section-by-section (§5b) → public
   `/jobs` (live filter + pager) → `/jobs/[slug]` → `/login` + `/signup`.
4. **Member shell** (`(member)/layout.tsx`: TopBar + Sidebar, §6a) → **Dashboard** → Browse →
   Saved → Applications → Job Detail → then the tools (Match, Interview, CV, Cover Letter) →
   Profile → Alerts.
5. **Mobile** — port `design_files/native/` (Expo) **or** build the member app as a responsive
   PWA reusing the web components; wire the bottom-tab + stack nav.
6. **Pass** — responsive (§9), `prefers-reduced-motion`, a11y (labels, focus-visible, alt text,
   `<details>` semantics), light & dark, Lighthouse.

---

## 13. Definition of done

- Every route visually matches its design file at desktop **and** mobile; light **and** dark both
  correct; theme persists across the marketing site, member app, and mobile app.
- Landing micro-animations (remote flip, count-up loop, logo nod, marquees, live wall/feed) work
  and **degrade to final states** under reduced-motion / print / SSR.
- Member shell (top bar + sidebar) is one reusable layout; all 11 member screens live inside it.
- Live search/filter, the kanban tracker, and every tool screen behave as specified; the apply
  flow (mobile) records and blocks re-apply.
- Copy is **worldwide**; **no** Greenhouse/Glassdoor references; pricing reads **Day Pass $3 /
  Pro $19/mo**.
- Seed data is swappable for the real API (`api.md`) without changing component props. No console
  errors.

---

## 14. Out of scope (reference only)

The project root also contains a large set of **marketing & growth collateral** — social/video
ad templates, launch decks, IG reels, and export tooling (e.g. `Launch Deck.html`,
`Social Ads*.html`, `Brand Video.html`, `Audience Ads.html`, the `*.jsx` scene/renderers). These
are **production-design artifacts for campaigns, not part of the app build** — they share the
brand but are not screens to implement. Ignore them unless a task specifically asks for one.
