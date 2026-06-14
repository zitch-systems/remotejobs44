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
| Foldable / tablet master–detail | ⏳ planned (handoff §6) |

Data is currently the handoff's **seed set** (`src/lib/seed.ts`). Auth is real
when env is configured; `saved`/`applied` live in a Zustand store and are not
yet persisted to Supabase (see Roadmap).

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
  lib/                      # supabase, auth, types, seed
  store/                    # zustand (saved / applied)
```

- **Design tokens** (`src/theme/tokens.ts`) are a 1:1 port of
  `design-reference/colors_and_type.css` — keep them in sync with the web app's
  `tailwind.config.js`.
- **Fonts**: Sora (display) + DM Sans (body) via `@expo-google-fonts/*`, loaded
  in the root layout (static per-weight files — reliable across iOS/Android,
  unlike loading a single variable TTF).
- **Auth**: `src/lib/auth.tsx` wraps Supabase; falls back to **demo mode** when
  `EXPO_PUBLIC_SUPABASE_*` is unset so the UI is explorable immediately.

## Roadmap (next)

1. **Live data** — replace `seed.ts` with Supabase queries; persist
   `saved` / `applied` to the user's rows (reuse the web RLS policies).
2. **Foldable / tablet** master–detail layout (handoff §6) via a width breakpoint.
3. **Social sign-in** — wire `supabase.auth.signInWithOAuth()` with
   `expo-web-browser` + the official Google / LinkedIn provider config.
4. **Push notifications** for job alerts (`expo-notifications`).
5. **Secure session storage** — swap AsyncStorage for an
   `expo-secure-store`-backed `LargeSecureStore` adapter (chunked, since
   Supabase sessions exceed SecureStore's 2 KB/key limit).
6. **Real brand assets** — replace the placeholder Expo icon/splash with the
   RemoteJobs44 logo, and company gradient tiles with real images.
7. **EAS** build/submit config for TestFlight + Play internal testing.

## Security notes (carried from the web audit)

- Tokens persist in **AsyncStorage** (unencrypted) today — item 5 above hardens this.
- Only `EXPO_PUBLIC_*` values ship in the bundle; never put service-role keys here.
- All data access stays behind Supabase **RLS** (same policies as the web app).
