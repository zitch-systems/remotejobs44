# Building the RemoteJobs44 Android APK

The app is APK-ready (native modules autolink, `app.json` has the package id +
icons + plugins, and `eas.json`'s `preview` profile is set to
`android.buildType: "apk"`). What's left is account-side and can't be done from
this repo's CI without your Expo credentials.

There are two ways to build. **Path A is the fastest for a first APK.**

---

## One-time link (both paths need this)

From the `mobile/` directory, with your Expo account:

```bash
cd mobile
npm i -g eas-cli
eas login
eas init        # links this app to your Expo project; writes owner +
                # extra.eas.projectId into app.json — commit that change
```

> Use the **organization** you created as the owner when prompted. The slug
> must stay `remotejobs44` (matches app.json).

Give the build your backend creds as **EAS secrets** (otherwise the APK runs in
demo mode on seed data):

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL      --value https://<proj>.supabase.co --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key>                 --visibility sensitive
# optional:
eas env:create --name EXPO_PUBLIC_SENTRY_DSN        --value <dsn>                      --visibility sensitive
```

---

## Path A — build locally (recommended first time)

```bash
cd mobile
eas build --platform android --profile preview
```

EAS builds in the cloud (~15–30 min on the free tier; it manages the Android
keystore for you). When it finishes it prints a URL — download the **`.apk`**
there and sideload it, or share the internal-distribution link.

> Prefer no cloud at all? `npx expo prebuild -p android && cd android &&
> ./gradlew assembleRelease` produces `app-release.apk` locally — but you need
> the Android SDK + JDK installed and you manage signing yourself.

---

## Path B — build from GitHub ("push/click → APK")

A workflow is wired at `.github/workflows/eas-build-android.yml`. To enable it:

1. **Add the token secret.** Expo dashboard → your org → **Access tokens** →
   create one → GitHub repo **Settings → Secrets and variables → Actions** →
   new secret named **`EXPO_TOKEN`**.
2. Make sure `eas init` (above) has been committed so `app.json` is linked.

Then trigger a build either way:

- **Actions tab → "EAS Build (Android APK)" → Run workflow** (pick `preview`), or
- push a tag: `git tag mobile-v1 && git push origin mobile-v1`.

The job queues an EAS build and prints the build URL in its logs; download the
`.apk` from there or the EAS dashboard. (It does **not** build on every push —
that would burn build minutes.)

---

## After the APK

- Install on a device (sideload the `.apk`, or use the EAS internal link).
- For full functionality (not demo), also do `README.md` → **Deploy checklist**:
  apply migrations **v37 + v38**, deploy + schedule the **push function**, and
  enable the **OAuth providers**.
- For the Play Store, build with `--profile production` (outputs an `.aab`) and
  `eas submit -p android`.
