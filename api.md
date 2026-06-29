# RemoteJobs44 — Claude Code Handoff (full product)

A self-contained package for rebuilding the **entire RemoteJobs44 product** in a real codebase:
the marketing site, the signed-in member web app, and the mobile app — all on one design system.

> **Start with [`CLAUDE.md`](./CLAUDE.md).** It is the authoritative, self-sufficient
> implementation spec (stack, tokens, per-screen component breakdowns, interactions, build
> order, definition of done). This README is just the map.

---

## What RemoteJobs44 is

A worldwide remote-jobs marketplace — *every genuinely-remote job, verified and searchable in one
place* (70,000+ live roles · 150+ countries). Three surfaces, one **"Deep Ocean"** design system
(deep-navy + sunrise-orange, Sora/DM Sans):

1. **Marketing web** — public landing, jobs browse, job detail, login, signup.
2. **Member web app** — a signed-in dashboard + 10 job-hunt tools inside a sidebar shell.
3. **Mobile app** — an installable PWA (and an Expo/React-Native rendition).

## These are design references, not shippable code

Everything in `design_files/` is a **working HTML/CSS/JS prototype** that shows the intended look,
copy, data shape, and behavior. The task is to **recreate it** in the target environment, not to
ship the HTML. Target stack: **Next.js (App Router) + Tailwind** for web (repo
`zitch-systems/remotejobs44`), **Expo/React Native** for the native app — see `CLAUDE.md §1–2`.

## Fidelity: **high**

Final colors, typography, spacing, radii, shadows, copy, and interactions. Recreate
pixel-accurately using the codebase's component library, then wire to real data. Exact values are
in `tokens/` and `CLAUDE.md §4`.

---

## What's in this bundle

```
claude_code_handoff_full/
  README.md                  ← you are here (the map)
  CLAUDE.md                  ← THE spec — read this to implement
  api.md                     ← proposed REST endpoints + TypeScript types
  tokens/                    ← the shared design system, copied for quick reference
    colors_and_type.css        design tokens (source of truth: colors, type, spacing, radii…)
    components.css             web component styles (header, buttons, job cards, rails, footer…)
    app-styles.css             mobile-app shell tokens (tab bar, inputs, cards…)
    app-screens.css            mobile-app screen styles
  screenshots/               ← rendered PNG of each screen, numbered to match the index below
                               (the animated full-bleed landing is best viewed live — open its HTML)
  design_files/
    web/                       the marketing site + member web app (self-contained: HTML+CSS+JS+fonts+assets)
    app/                       the mobile PWA (vanilla-JS reference implementation)
    native/                    the Expo / React-Native rendition (same screens & tokens)
    RemoteJobs44 - Mobile App - Handoff.md       deep-dive spec for the mobile app
    RemoteJobs44 - Mobile Landing View - Handoff.md   the landing's responsive mobile spec
```

Each design file opens standalone in a browser — double-click to see the live target (theme
toggle, animations, live filtering all work).

---

## Screen index

**Marketing web** (`design_files/web/`)
- `Deep Ocean Landing Desktop.html` → `/` — the marketing landing (15 sections; this is the latest)
- `B Jobs.html` → `/jobs` — public browse (dark hero + filter rail + live search)
- `B Job.html` → `/jobs/[slug]` — public job detail
- `B Login.html` / `B Signup.html` → `/login` `/signup` — split-screen auth

**Member web app** (`design_files/web/`, all in the sidebar shell)
- `Member Dashboard Desktop.html` → `/dashboard`
- `Browse Jobs.html` · `Saved Jobs.html` · `Applications.html` · `Job Detail.html`
- `Job Match.html` · `AI Interview.html` · `CV Builder.html` · `Cover Letter.html`
- `Profile.html` · `Alerts.html`

**Mobile app** — `design_files/app/index.html` (PWA) and `design_files/native/` (RN). Screens:
Auth, Home/Feed, Search+Filters, Job Detail + Apply sheet, Applications, Saved, Notifications,
Profile.

**Alternate direction — Spotlight** (`Landing A.html`, `A Jobs.html`, `A Job.html`): a light/warm
exploration on the same tokens. **Reference only — do not build** unless asked. The canonical
direction is **Deep Ocean** (the `B*` / member screens).

---

## Assets

In `design_files/web/assets/` (web-downscaled JPEGs) and `design_files/app/assets/`:
- `hero-videocall-sm.jpg` — landing hero + login brand panel
- `ig-duo-laptops.jpg` — jobs-browse hero · `ig-focused-desk.jpg` — job-detail hero
- `ig-high-five.jpg` — landing floating card + signup panel
- `people-4-portrait.jpg` — member avatar / testimonial · `ad-blazer-man.jpg`, `ad-coffee-woman.jpg` — quote portraits
- `app/assets/auth-bg.png` — mobile auth hero
- **Fonts**: `design_files/web/fonts/` — Sora + DM Sans variable TTFs (also on Google Fonts).
- **Company logos**: fetched at runtime (Google favicon → DuckDuckGo → monogram); none bundled.
- **Icons**: inline Feather/Lucide-style 2px-stroke SVGs — map to Lucide.

> Replace stock photography and hot-linked company logos with licensed/owned assets before
> shipping (see `CLAUDE.md §10`).

---

## How to use this

1. Read `CLAUDE.md` top to bottom.
2. Skim `screenshots/` for a visual index, opening the matching `design_files/` HTML for any
   screen you're building (live behavior + exact DOM). For the landing, open
   `design_files/web/Deep Ocean Landing Desktop.html` directly — it's an animated, scroll-through
   page that's best experienced live.
3. Port `tokens/colors_and_type.css` into your theme first (everything depends on it).
4. Follow the build order in `CLAUDE.md §12`; check yourself against `§13 Definition of done`.
5. Use `api.md` to wire data — keep the mock response shapes so seed data swaps cleanly for the
   real API.
