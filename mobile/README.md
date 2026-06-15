# RemoteJobs44 — Mobile App (Expo / React Native)

The native app for [RemoteJobs44](https://remotejobs44.com). Built with **Expo
SDK 56 + Expo Router**, sharing the **same Supabase backend** and the **same
design tokens** as the web app. Implemented from `design-reference/` (the
design handoff bundle).

## Status — v1 foundation

| Screen | State |
|---|---|
| Auth (sign in / create account) | ✅ Supabase email/password + Google/LinkedIn OAuth + demo |
| Home / Match feed | ✅ real search, filter sheet, pull-to-refresh, pagination, skill-personalised ranking |
| Job detail | ✅ match ring, sections, one-tap apply + success burst |
| Saved jobs | ✅ dedicated tab, live + reactive to unsaves |
| Applications tracker | ✅ status pills, empty state |
| Profile | ✅ real name/avatar/strength + Edit profile + Job preferences (skills) + CV |
| Foldable / tablet master–detail | ✅ responsive list + live detail pane (≥ 840px) |

Bottom nav is now **Home · Saved · Applied · Profile** + the center quick-match FAB.

**Data:** live from Supabase when `EXPO_PUBLIC_SUPABASE_*` is configured —
`jobs` (public read), with `saved_jobs` and `applications` persisted per-user
under RLS (hydrated on sign-in, optimistic write-through on save/apply). With
no env, the app runs on the handoff **seed set** so the UI is fully explorable
offline.

> The **match score** is computed in `src/lib/jobs.ts` from real job signals
> (skill richness, salary transparency, recency, featured) and then boosted by
> overlap with the user's saved **skills** (Profile → Job preferences). A
> server-side relevance model is the eventual upgrade. Verdict + gradient tile
> are still derived display-only fields.

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
eas init                                   # creates the EAS project + extra.eas.projectId
eas build -p android --profile preview     # → installable .apk (buildType: apk)
eas build -p ios --profile preview         # → iOS internal build
```

The `preview` profile is set to `android.buildType: apk`, so the Android build
produces a directly-installable **APK** (sideload / Play internal). Production
(`--profile production`) makes an `.aab` for the Play Store.

Provide the Supabase env to builds via EAS secrets (or an `env` block per
profile): `eas env:create --name EXPO_PUBLIC_SUPABASE_URL ...`. The
RemoteJobs44 app icon + splash are generated from the brand mark (blue tile +
chart-line + orange dot); regenerate with `node mobile/scripts/gen-icons.mjs`
if the mark changes (uses the repo-root `sharp`).

## Recently added

- **AI interview prep** (`app/profile/interview-prep.tsx`) — role + level →
  behavioural / technical / remote questions with tips + red flags, via the
  **`ai-interview-prep` edge function** (deploy + `AI_API_KEY` to enable).
- **Profile completion checklist** (`components/ProfileChecklist.tsx`) — the
  remaining in-app steps (name, CV, skills, target role) on the Profile screen.
- **"Add your skills" nudge** — a dismissible banner on the feed when no skills
  are set, linking to Job preferences (drives the personalised match score).
- **AI CV review** (`app/profile/ai-review.tsx` + `lib/ai.ts`) — paste your CV +
  target role → score, strengths, gaps, rewrite tips, missing ATS keywords. Runs
  on the **`ai-cv-review` edge function** (`supabase/functions/ai-cv-review`,
  any OpenAI-compatible API); deploy it + set `AI_API_KEY` to enable.
- **Search history & suggestions** — recent + popular terms under the feed
  search (`store/search.ts` + `components/SearchSuggestions.tsx`).
- **Empty-state CTAs** — "Reset filters" on the feed, "Browse jobs" on
  Saved/Applications.
- **Deep links** — `remotejobs44.com/jobs/:id` (and `remotejobs44://job/:id`)
  open the job detail (`app/jobs/[id].tsx` + app.json intent filters /
  associated domains; host the `.well-known` files on the web for verification).
- **List fade-in** — job cards gently fade + rise as they appear.
- **In-app toasts** (`store/toast.ts` + `components/Toaster.tsx`) — lightweight
  feedback on save / apply, mounted once in the root layout.
- **Similar roles** — the job detail lists other roles in the same category
  (`components/SimilarRoles.tsx`).
- **Offline feed cache** (`lib/feed-cache.ts`) — the last feed page is persisted
  and shown instantly on cold start while fresh data loads.
- **CV upload** (`app/profile/cv.tsx`) — pick a PDF/Word doc (`expo-document-picker`)
  → uploads to the `cvs` storage bucket (**`supabase/migration_v39_cv_storage.sql`**)
  → saves the URL on the profile.
- **Onboarding** — a 3-slide first-run intro (`app/onboarding.tsx`), shown once
  (persisted `onboarded` flag in `store/prefs.ts`); the entry redirect waits for
  prefs to hydrate before routing.
- **Notification preferences** (`app/profile/notifications.tsx`) — toggles for
  "New job matches" / "Application updates", persisted; the push registration
  honours the matches toggle.
- **Appearance toggle** — System / Light / Dark, persisted (`store/theme.ts`);
  `useTheme()` follows it. Cycle it from Profile → Appearance.
- **Pull-to-refresh** on Saved + Applications (re-fetches without the full loader).
- **Haptic feedback** (`lib/haptics.ts`) — a light tap on save, a success buzz on
  apply (no-op where unsupported).
- **Branded loading animation** (`components/BrandLoader.tsx`) — the logo mark
  (blue tile + chart-line + orange dot) pulses inside a spinning brand arc;
  shown wherever items load (feed, saved, applications, job detail, preferences,
  app entry).
- **Share a job** — the job-detail share button uses the native share sheet.
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
- **Error reporting** (`lib/sentry.ts`) — gated on `EXPO_PUBLIC_SENTRY_DSN`;
  `initSentry()` + `withSentry()` in the root layout, `captureError()` wired
  into the auth/store failure paths. No-op until a DSN is set.
- **Unit tests** — pure logic extracted to `lib/format.ts` and covered by
  `lib/format.test.ts` (jest-expo). `npm test` (also in CI).

## Deploy checklist (what's left to operate)

The app code is complete; these are infra/ops steps that can't be done from a
sandbox:

1. **Apply migrations** — `migration_v37_device_push_tokens.sql` (push tokens)
   and `migration_v38_profile_preferences.sql` (skills/target_role/headline).
2. **Deploy the push sender** — `supabase functions deploy send-job-alerts`,
   set `PUSH_CRON_SECRET`, and schedule it (pg_cron). It reads
   `device_push_tokens` and calls Expo's push API. (Code:
   `supabase/functions/send-job-alerts/index.ts`.)
3. **Enable OAuth providers** (Google + LinkedIn OIDC) in Supabase Auth and add
   the `makeRedirectUri` URL to the redirect allow-list.
4. **`eas init`** for the EAS `projectId` (needed for Expo push tokens) and a
   **Dev Client** build (Expo Go can't receive remote push).
5. **On-device QA** — OAuth round-trip, push delivery, encrypted-storage I/O.

## Roadmap (later)

- **Server-side relevance model** — replace the client signal+skills score with
  a learned profile ↔ job relevance score.
- **Native crash + source maps** — add the `@sentry/react-native/expo` config
  plugin (with org/project + `SENTRY_AUTH_TOKEN`) on top of the runtime init.
- **Component/integration tests** — extend the unit suite to screens.

## Security notes (carried from the web audit)

- The session is **encrypted at rest** (AES key in the device keystore via
  `expo-secure-store`, ciphertext in AsyncStorage) — `lib/secure-store-adapter.ts`.
- Only `EXPO_PUBLIC_*` values ship in the bundle; never put service-role keys here.
- All data access stays behind Supabase **RLS** (same policies as the web app);
  saved/application writes are scoped to `auth.uid()`.
