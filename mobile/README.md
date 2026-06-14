# RemoteJobs44 — Mobile App (Expo / React Native)

The native app for [RemoteJobs44](https://remotejobs44.com). Built with **Expo
SDK 56 + Expo Router**, sharing the **same Supabase backend** and the **same
design tokens** as the web app. Implemented from `design-reference/` (the
design handoff bundle).

## Status — v1 foundation

| Screen | State |
|---|---|
| Auth (sign in / create account) | ✅ real Supabase auth + demo fallback |
| Home / Match feed | ✅ stats, search, promo, filters, job cards |
| Job detail | ✅ match ring, sections, one-tap apply + success burst |
| Applications tracker | ✅ status pills, empty state |
| Profile | ✅ strength, list groups, real sign-out |
| Foldable / tablet master–detail | ✅ responsive list + live detail pane (≥ 840px) |

**Data:** live from Supabase when `EXPO_PUBLIC_SUPABASE_*` is configured —
`jobs` (public read), with `saved_jobs` and `applications` persisted per-user
under RLS (hydrated on sign-in, optimistic write-through on save/apply). With
no env, the app runs on the handoff **seed set** so the UI is fully explorable
offline.

> A few display-only fields the design uses but the DB doesn't store yet —
> the **match score**, verdict and gradient tile — are derived deterministically
> in `src/lib/jobs.ts` (clearly marked). Swap for a real scoring service when
> one exists.

## Run it

```bash
cd mobile
cp .env.example .env        # optional — omit to run in demo mode
npm install                 # if node_modules isn't present
npx expo start              # press i (iOS sim), a (Android), or scan in Expo Go
```

> This is a monorepo subfolder of `zitch-systems/remotejobs44`; the mobile app
> has its own `package.json` / `node_modules` and does **not** share the web
> app's build.

## Architecture

```
src/
  app/                      # Expo Router (file-based) routes
    _layout.tsx             # fonts + providers + root stack
    index.tsx               # auth-gated entry redirect
    (auth)/sign-in.tsx      # Auth screen
    (tabs)/                 # Home · Applications · Profile + center FAB
    job/[id].tsx            # Job detail + apply
  components/               # ui.tsx primitives, JobCard, MatchRing
  theme/                    # tokens.ts (ported 1:1 from the web) + useTheme()
  lib/                      # supabase, auth, oauth, push, secure-store-adapter,
                            #   jobs (live data), user-state, types, seed
  store/                    # zustand (saved / applied + hydrate/write-through)
```

- **Design tokens** (`src/theme/tokens.ts`) are a 1:1 port of
  `design-reference/colors_and_type.css` — keep them in sync with the web app's
  `tailwind.config.js`.
- **Fonts**: Sora (display) + DM Sans (body) via `@expo-google-fonts/*`, loaded
  in the root layout (static per-weight files — reliable across iOS/Android,
  unlike loading a single variable TTF).
- **Auth**: `src/lib/auth.tsx` wraps Supabase; falls back to **demo mode** when
  `EXPO_PUBLIC_SUPABASE_*` is unset so the UI is explorable immediately.

## Builds (EAS)

`eas.json` defines `development` / `preview` / `production` profiles.

```bash
npm i -g eas-cli && eas login
eas init                       # creates the EAS project, writes extra.eas.projectId
eas build --profile preview    # internal-distribution build (TestFlight / Play internal)
```

Provide the Supabase env to builds via EAS secrets (or an `env` block per
profile): `eas env:create --name EXPO_PUBLIC_SUPABASE_URL ...`. The
RemoteJobs44 app icon + splash are generated from the brand mark (blue tile +
chart-line + orange dot); regenerate with `node mobile/scripts/gen-icons.mjs`
if the mark changes (uses the repo-root `sharp`).

## Recently added

- **Social sign-in** (`lib/oauth.ts`) — Google + LinkedIn via PKCE
  (`signInWithOAuth` + `expo-web-browser` + `expo-auth-session`).
  *Setup:* enable the Google / LinkedIn (OIDC) providers in Supabase Auth and
  add the app redirect URL (printed by `makeRedirectUri`) to the allow-list.
- **Encrypted session storage** (`lib/secure-store-adapter.ts`) — the Supabase
  session is now AES-encrypted at rest (key in `expo-secure-store`, ciphertext
  in AsyncStorage), and the client uses PKCE.
- **Push notifications** (`lib/push.ts`) — permission + Expo push token
  registration, token persisted to `device_push_tokens`
  (`supabase/migration_v37_device_push_tokens.sql`), and tap-to-open-job
  routing. *Setup:* apply the migration, run `eas init` (for the push token's
  `projectId`), build a Dev Client (Expo Go can't receive remote push).
- **Signal-based match score** — `lib/jobs.ts` now scores jobs from real
  signals (skill richness, salary transparency, recency, featured) instead of a
  random hash.

## Roadmap (next)

1. **Push sender** — an edge function / cron that finds new matching jobs per
   user and calls Expo's push API using the stored `device_push_tokens`
   (the only remaining server-side piece for alerts).
2. **Server-side relevance model** — replace the client signal score with a
   profile ↔ job relevance score (needs structured user skills, which the
   `profiles` table doesn't store yet).

## Security notes (carried from the web audit)

- The session is **encrypted at rest** (AES key in the device keystore via
  `expo-secure-store`, ciphertext in AsyncStorage) — `lib/secure-store-adapter.ts`.
- Only `EXPO_PUBLIC_*` values ship in the bundle; never put service-role keys here.
- All data access stays behind Supabase **RLS** (same policies as the web app);
  saved/application writes are scoped to `auth.uid()`.
