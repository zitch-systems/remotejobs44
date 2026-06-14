# Handoff: RemoteJobs44 Mobile App — Auth + Job Search

## Overview
This is the mobile (and foldable/tablet) experience for **RemoteJobs44**, a job board for verified remote roles across Africa. It covers the full signed-in job-search loop plus the new authentication front door:

- **Auth** — Sign in / Create account (email + password or social)
- **Home / Match feed** — personalized, match-scored job cards with filters
- **Job detail** — full role description, match breakdown, one-tap apply
- **Applications** — a tracker for everything you've applied to
- **Profile** — profile strength, CV, saved jobs, preferences, sign out
- **Foldable / tablet** — the same app in a side-by-side master–detail layout

## About the Design Files
The files in this bundle are **design references created in HTML/CSS/JS** — a working prototype that demonstrates the intended look, layout, copy, and interaction behavior. **They are not production code to copy verbatim.**

Your task is to **recreate these designs inside the target codebase's existing environment** (React Native, Expo, Flutter, SwiftUI, a React web PWA, etc.), using its established component library, navigation, state, and styling conventions. If no app environment exists yet, choose the framework that best fits the project and implement there.

The production source of truth for this brand is a Next.js + Tailwind app (`zitch-systems/remotejobs44`); the tokens in `colors_and_type.css` are lifted directly from it, so prefer wiring these designs into that existing system if you're working in it.

## Fidelity
**High-fidelity (hifi).** All colors, typography, spacing, radii, shadows, copy, and interactions are final and intentional. Recreate the UI to match using the codebase's existing primitives. Exact values are documented below and in `colors_and_type.css`.

---

## Design Tokens
All tokens live in **`colors_and_type.css`** as CSS custom properties. Key values:

### Typefaces
- **Display** (`--font-display`): **Sora** (weights 100–800). Used for all headings, buttons, labels, numbers, nav labels.
- **Body** (`--font-body`): **DM Sans** (weights 100–1000). Used for paragraphs, descriptions, field text, meta.
- **Mono** (`--font-mono`): system monospace. Used for the `01 / 02` section indices on the board only.
- Fonts are bundled as variable TTFs in `./fonts/`. Both are available on Google Fonts.

### Brand palette — "Deep Ocean" blue
| Token | Hex | Use |
|---|---|---|
| `--brand-50` | `#eff6ff` | tag/chip backgrounds |
| `--brand-100` | `#dbeafe` | tag borders |
| `--brand-600` | `#2563eb` | **primary action, links, focus ring** |
| `--brand-700` | `#1d4ed8` | primary hover / heavy text-on-light, promo gradient |
| `--brand-800` | `#1e3a5f` | dark surface |
| `--brand-900` | `#0f1e38` | dark surface 2 |
| `--brand-950` | `#060e1f` | darkest |

### Accent — "Sunrise orange"
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#f97316` | logo dot, FAB, **Apply button**, saved-bookmark icon, avatar gradient |
| `--accent-dark` | `#d48a0a` | — |

### Neutrals / surfaces (light)
| Token | Hex | Use |
|---|---|---|
| screen bg | `#f4f7fc` | app screen background (note: slightly cooler than `--bg-app #f8faff`) |
| `--bg-card` | `#ffffff` | cards, fields, nav |
| `--border-1` / card | `#eaeef6` | card borders |
| `--border-2` / input | `#e6ecf5` | input & chip borders |
| `--border-3` | `#f1f5f9` | hairline dividers |
| `--fg-1` | `#0f172a` | primary text |
| `--fg-2` | `#475569` | body text |
| `--fg-3` | `#64748b` | secondary/labels |
| `--fg-4` | `#94a3b8` | placeholder / meta / muted icons |
| `--fg-5` | `#cbd5e1` | disabled / chevrons |

### Semantic
- Success `#1ea05e`, success-bg `#eafaf1`, success border `#bbf7d0` — verified badge, match ring, "Interview" status, apply-success burst.
- Warning/orange text `#c2410c`, bg `#fff4ec`/`#fff7ed`, border `#fed7aa` — "In review" status, accent stat card.
- Info/applied `#1d4ed8`, bg `#eff6ff`, border `#dbeafe` — "Applied" status.
- Danger `#dc2626` — Sign out row label.

### Radius scale
`14px` fields/chips/stat cards · `15px` rows/primary buttons/list groups · `17px–18px` job cards & badges container · `12px` logos/icon buttons · `20px` promo banner · `42px`/`23px` screen inner corners · `999px` pills.

### Shadows (brand/neutral tinted)
- Card: `0 8px 20px rgba(15,30,56,0.05)`
- Field: `0 6px 16px rgba(15,30,56,0.04)`
- Primary blue button: `0 14px 28px rgba(37,99,235,0.40)`
- Orange Apply / FAB: `0 12px 26px rgba(249,115,22,0.40)` / `0 10px 22px rgba(249,115,22,0.42)`
- Focus ring: `0 0 0 3px rgba(37,99,235,0.14)`

### Spacing
4px base scale (`--space-1`…`--space-16`). Screen horizontal padding is **22px** for most views; the auth view uses **28px**.

### Motion
- View transitions: `transform .26s ease` (incoming view slides from `translateX(12px)` + fade).
- Button press: `transform: scale(.98)` over `.12s`.
- Field focus: border + ring over `.15s`.
- Apply success burst: check pops `scale(.4→1)` `cubic-bezier(.2,1.3,.4,1)` `.5s`, container fades over `1.1s`.
- Honor `prefers-reduced-motion`.

---

## Device frames
The HTML renders the app inside mocked hardware for presentation only — **do not build the bezels**. The actual app surface is:
- **Phone**: `390 × 812` logical px, inner screen radius `42px`, with an iOS-style Dynamic Island and a status bar (`9:41`, signal/wifi/battery).
- **Foldable folded (cover)**: `392 × 840`, single pane — shows the phone feed.
- **Foldable unfolded / tablet**: `1040 × 840`, three columns: a `74px` icon rail + a `352px` job list pane + a flexible detail pane.

---

## Screens / Views

### 1. Auth — Sign in / Create account
**Purpose:** Authenticate, or register, before entering the app.
**Layout:** Single vertical column, 28px side padding, on the `#f4f7fc` screen bg. A soft blue radial glow sits behind the top (`radial-gradient(rgba(37,99,235,0.16))`). Order top→bottom:
1. **Brand block** (centered): 54×54 rounded-`17px` logo tile with blue gradient `linear-gradient(150deg,#2563eb,#1d4ed8)` + magnifier glyph, shadow `0 14px 30px rgba(37,99,235,0.4)`; below it the wordmark **RemoteJobs** + **44** (the `44` in `--accent`), Sora 800, 16px.
2. **Heading** (Sora 800, 23px, `-0.025em`): "Welcome back" (sign in) / "Create your account" (sign up).
3. **Sub** (DM Sans, 12.5px, `#64748b`): sign in → "Sign in to pick up your job search where you left off."; sign up → "Join 40,000+ remote workers finding verified roles across Africa."
4. **Segmented control** (`.af-seg`): pill container `#eaeff7`, radius 14, 4px padding; two segments "Sign in" / "Create account". Active segment: white, `#0f172a` text, shadow `0 4px 10px rgba(15,30,56,0.09)`. Inactive: `#64748b`.
5. **Form** (`.af-form`, 13px gap):
   - *(sign up only)* **Full name** field — user icon + placeholder "Ada Obi".
   - **Email** field — mail icon + placeholder "you@email.com"; sign-in prefills value `ada.obi@gmail.com`.
   - **Password** field — lock icon + input (`type=password`) + trailing **eye** toggle; sign-in prefills `••••••••`, sign-up placeholder "Create a password".
   - *(sign in only)* **Forgot password?** link, right-aligned, `#2563eb`, Sora 600, 11.5px.
   - **Primary button** (`.af-primary`): 50px tall, radius 15, bg `--brand-600`, white Sora 700 14px label "Sign in"/"Create account" + arrow icon, shadow `0 14px 28px rgba(37,99,235,0.4)`.
   - **Field spec** (`.af-field`): 48px tall, white, 1.5px `#e6ecf5` border, radius 14, 15px H padding, 11px gap; leading icon 16px `#94a3b8`; input is DM Sans 13px/500, placeholder `#9aa7bd`. **Focus-within:** border `#2563eb` + ring `0 0 0 3px rgba(37,99,235,0.14)`.
   - **Field label** (`.af-lab`): Sora 700, 11px, `#475569`, 7px above field.
6. **Divider** (`.af-or`): hairline `#e6ecf5` — "OR CONTINUE WITH" — hairline (Sora 600, 10.5px, uppercase, `#94a3b8`).
7. **Social row** (`.af-soc`): two equal buttons, 47px tall, white, 1.5px `#e6ecf5`, radius 14, Sora 700 12.5px `#334155`. Each has a 21px rounded monogram tile + label: **Google** (white tile, `#4285f4` "G", bordered) and **LinkedIn** (`#0a66c2` tile, white "in"). *Use the platform's official SDK sign-in buttons/branding in production — these monograms are placeholders.*
8. **Footer** (`.af-foot`, pushed to bottom via `margin-top:auto`): toggle text — sign in → "New to RemoteJobs44? **Create account**"; sign up → "Already have an account? **Sign in**" (bold part `--brand-700`, tappable). Below it a trust line (`.af-trust`): green shield check + "Bank-grade security · verified employers only" (10.5px, `#94a3b8`).

**Status bar / bottom nav:** the bottom tab bar is **hidden** on this view. Status bar remains (dark glyphs work on the light bg).

### 2. Home / Match feed
**Purpose:** Browse personalized, match-scored jobs; filter; save; open.
**Layout (scrolls):**
- **App header** (`.ahead`, 22px padding): left "Welcome back" (11.5px `#64748b`) + "Hi, **Ada**" (Sora 800 17px, "Ada" in accent); right 38px rounded-12 avatar "A" (accent gradient) with a green online dot.
- **Quick-stats strip** (3 cards): "12 Applications", "2 Interviews", and an accent card "84% Profile strength" (orange variant: bg `linear-gradient(150deg,#fff7ed,#ffedd9)`, border `#fed7aa`, value `#c2410c`). Cards: white, radius 14, value Sora 800 16px, label 10px `#64748b`.
- **Search bar**: white pill-ish field radius 14, magnifier + "Search remote jobs…" placeholder + a 30px blue filter button on the right.
- **Promo banner** (`.promo`): blue gradient `135deg,#1d4ed8→#1e3a8a`, radius 20, white text, with an orange radial glow top-right. Eyebrow "YOUR WEEKLY MATCH", H "12 new roles fit your profile", body, and a white CTA chip "See my matches →".
- **Section row**: "Top matches" (Sora 800 14px) + "See all" link (`#2563eb`).
- **Filter chips** (`.chips`): All / Engineering / Design / Marketing. Active chip = `#0f172a` bg, white text; inactive = white, `#475569`, 1.5px `#e6ecf5`. Selecting filters the list.
- **Job list** — see Job Card below.

**Job Card** (`.jcard`, white, radius 18, 1.5px `#eaeef6`, card shadow):
- Top row: 40px rounded-12 company logo tile (per-company gradient, white initial, Sora 800) · role (Sora 700 13.5px) + company line with a green **Verified** badge (check icon) · right column: green **`{match}% match`** pill (`#15803d` on `#eafaf1`/`#bbf7d0`) and a 28px **save/bookmark** toggle.
- Tags row: small pills; default `#f1f5fb`/`#475569`, blue variant `#eff6ff`/`#1d4ed8`.
- Footer (top border `#f1f5f9`): salary (Sora 800 13px, unit muted) · time-ago (`#94a3b8`).
- Hover: lift shadow; active: `scale(.985)`. Tapping the card (not the save button) opens detail.

### 3. Job detail
**Purpose:** Read the full role and apply in one tap.
**Layout (scrolls; fixed apply bar at bottom):**
- **Hero**: back button + share button (34px white icon buttons, radius 11). Company row: 54px rounded-16 logo + role (Sora 800 17px) + company/verified sub. Meta row: 3 cards — Location / Type / Level.
- **Match band** (`.dt-match`): a 78px **conic-gradient ring** (`#1ea05e` to `var(--p)%`, track `#e7edf6`, white center) showing `{match}%`, beside a verdict block: kicker ("Strong/Good/Fair match", green), `verdict` headline, `vcap` caption.
- **Sections**: "About the role" (paragraph) · "What you'll do" (bulleted list, accent dot bullets) · "Skills" (blue tag pills).
- **Apply bar** (`.applybar`, fixed, gradient fade to bg): 50px square **Save** button + full-width **Apply in one tap** button (`--accent` bg, bolt icon, white Sora 700 14px, orange shadow). After applying it turns green (`#1ea05e`) with a check + "Applied", and a centered success **check burst** animates over the screen.

### 4. Applications
**Purpose:** Track submitted applications.
**Layout:** Header "Applications" + count sub. If empty: centered empty state (rounded icon tile, "No applications yet", helper copy). Otherwise a scrolling list of rows (`.arow`): 36px logo, role + "company · location", and a status pill on the right:
- **Applied** — `#1d4ed8` on `#eff6ff`/`#dbeafe`
- **In review** — `#c2410c` on `#fff4ec`/`#fed7aa`
- **Interview** — `#15803d` on `#eafaf1`/`#bbf7d0`
Tapping a row reopens that job's detail. (Seed state: jobs 1,2,4 applied; statuses review/interview/applied.)

### 5. Profile
**Purpose:** Manage profile, CV, saved jobs, preferences; sign out.
**Layout:** Top: 56px avatar "A" + name "Ada Obi" + "Senior Frontend Engineer · Lagos". A "Profile strength 84%" card with a progress bar (`linear-gradient(90deg,#34d399,#1ea05e)`). A list group with rows: Edit profile › · My CV — Ada_Obi_CV.pdf › · Saved jobs `{count}` · Job preferences ›. A separate list group below contains **Sign out** (`#dc2626` label, sign-out icon) → returns to the Auth view (resets mode to "sign in").

### 6. Foldable unfolded / tablet (master–detail)
**Purpose:** Browse + read simultaneously on a wide screen.
**Layout:** three columns —
- **Rail** (`74px`, `#0d1b34`): logo tile, nav icons (home active, search, applied, messages), spacer, avatar at bottom.
- **List pane** (`352px`, `#fbfcfe`, right border): "Top matches" / "128 verified remote roles for you", a search field, filter chips, then a scrolling list of compact job rows (`.tjob`). Selected row: blue border + ring. Tapping a row updates the detail pane live.
- **Detail pane** (flex, `#f4f7fc`): a white cover (logo, role, sub with verified/location/posted, action row with ghost **Save** + orange **Apply now**, meta chips), then a body with a **horizontal match band** (ring + verdict + three labeled progress bars from `job.bd`) and the About / What you'll do / Skills sections.
A subtle vertical **hinge** line sits at the 50% mark.

---

## Interactions & Behavior
Each phone/folded instance runs an **independent app state**; the unfolded foldable runs its own master–detail controller.

- **Sign in / social / Create account** → navigate to **feed** (no real auth in the prototype — wire to your auth provider; show validation + loading + error states per your system).
- **Segmented control & footer toggle** → switch between sign-in and sign-up modes (re-renders the auth form; name field appears only in sign-up).
- **Eye toggle** → flips password field between `password`/`text`.
- **Job card tap** → open detail (slide-in transition). **Save/bookmark tap** → toggles saved set (stop propagation so it doesn't open detail); reflected on card, detail save button, and the profile "Saved jobs" count.
- **Filter chip tap** → re-render feed filtered by category.
- **Apply (`Apply in one tap`)** → add to applied set with status `applied`; button → green "Applied"; fire success burst; refresh Applications list + the stat count.
- **Bottom nav** → switch feed / applied / profile (active tab tinted `--brand-600`); nav hidden on **auth** and **detail** views. The center orange FAB is the bolt/quick-apply affordance.
- **Back** (detail) → return to feed.
- **Sign out** (profile) → return to auth (mode reset to sign in).
- **Foldable**: selecting a list row sets `sel` and re-renders the detail pane; Apply marks applied; filter chips filter the list.

## State Management
Per app instance (`mountApp`), state object `st`:
- `view`: `'auth' | 'feed' | 'detail' | 'applied' | 'profile'` — current screen.
- `authMode`: `'signin' | 'signup'`.
- `cur`: index of the job open in detail.
- `filter`: active category string (`'All'` default).
- `applied`: `Set<jobIndex>` (seed `{1,2,4}`).
- `saved`: `Set<jobIndex>` (seed `{3}`).
- `status`: `{ [jobIndex]: 'applied'|'review'|'interview' }` (seed `{1:'review',2:'interview',4:'applied'}`).

Foldable controller state: `sel` (selected index), `filter`, `applied: Set`.

In production, replace seed sets with fetched user data; `applied`/`saved`/`status` should persist to the backend. Auth should gate the whole app (the prototype's `data-start="auth"` is just the entry point).

## Assets
- **Logo**: drawn inline as a magnifier glyph (circle + handle) inside a rounded blue gradient tile — recreate with your real RemoteJobs44 logo asset. Standalone logo files exist in the project root (`Logo with Wordmark.png`, `Logo Instagram.png`).
- **Icons**: inline SVGs (Feather-style, 2px stroke): back, share, bolt, check, bookmark, search, home, applied, profile, chevron, arrow, filter, mail, lock, user, eye, signout, shield. Map these to your icon library (e.g. Lucide/Feather — names line up closely).
- **Company logos**: rendered as gradient initial tiles (no image assets) — keep or swap for real logos.
- **Fonts**: `./fonts/Sora-VariableFont_wght.ttf`, `./fonts/DMSans-VariableFont_opsz_wght.ttf`, `./fonts/DMSans-Italic-VariableFont_opsz_wght.ttf` (also on Google Fonts).
- **No emoji** in UI chrome (a couple appear inside seed job `location` strings only — `🌍`; treat as data, not design).

## Data model (seed `JOBS`)
Each job: `role, co, logo (initial), grad (CSS gradient), match (int %), cat, verified (bool), salary, per (/yr|/mo), time, location, type, level, tags ([label, variant]), about, duties ([…]), skills ([…]), verdict, vcap, bd ([label, value, pct] ×3 for the match breakdown)`. Five seed roles (Vercel, Paystack, Flutterwave, Kuda, Andela) — replace with live data.

## Files
- `RemoteJobs44 Mobile App.html` — the complete prototype (all screens + interaction engine). Inline `<style>` for the app/screen CSS; inline `<script>` for the render functions (`authView`, `feedView`/`feedCard`, `detailView`/`detailInner`, `appliedView`, `profileView`), the `mountApp` controller, and the foldable master–detail controller.
- `colors_and_type.css` — the design tokens (the source of truth for colors/type/spacing/radii/shadows).
- `fonts/` — the variable webfonts referenced by the CSS.

> Tip for implementers: search the HTML for the render functions named above to see exact markup per screen; the CSS classes are grouped by clear comment banners (`/* ===== AUTH / SIGN IN ===== */`, `/* ===== JOB DETAIL SCREEN ===== */`, etc.).
