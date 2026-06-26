# Deploying RemoteJobs44 to the Google Play Store (Codemagic)

The app builds a **signed `.aab`** via the `android-aab` workflow in
`codemagic.yaml`. Everything below is account/ops work that can't be done from
the repo. Package id: `com.remotejobs44.app`.

---

## 0. Choose your Play Console account type FIRST

| | Personal (yourself) | Organization |
| --- | --- | --- |
| For | An individual | A registered business |
| Needs | Personal ID + address + phone | A **D‑U‑N‑S number** + business verification |
| "20 testers / 14 days" closed-test gate (accounts created after 13 Nov 2023) | **Applies** before production | **Exempt** |
| Cost | $25 once | $25 once |

- **Personal** is the fastest to start (no D‑U‑N‑S) but you must run a closed
  test with **20+ testers for 14 continuous days** before Google grants
  production access.
- **Organization** skips that gate and looks more credible, but requires a
  registered business and a D‑U‑N‑S number (see below).

Register at <https://play.google.com/console> ($25 one-time).

---

## 1. Codemagic one-time setup

1. **Connect** the GitHub repo `zitch-systems/remotejobs44` in Codemagic.
2. **Upload an upload keystore** under reference name `remotejobs44_keystore`
   (Code signing → Android keystores). Generate one:
   ```bash
   keytool -genkey -v -keystore remotejobs44.jks -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   **Back this file + its passwords up forever** — it's your upload key.
3. **Env group `expo_public`** (mark Secure):
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - optional `EXPO_PUBLIC_SENTRY_DSN`

> `versionCode` is stamped automatically from Codemagic's build number (the
> `Stamp Android versionCode` step), so you never hit a "duplicate versionCode"
> rejection. `versionName` stays `1.0.0` in `app.json` — bump it for
> user-visible releases.

## 2. Build the AAB

Run the **`android-aab`** workflow in Codemagic (Start new build → pick it).
It runs `expo prebuild` → `gradlew bundleRelease` and produces a signed
`.aab` (emailed + in build artifacts).

## 3. Create the app + complete the listing in Play Console

Create app → then fill every required section (Dashboard shows what's missing):
- **Store listing**: short + full description, **app icon 512×512**,
  **feature graphic 1024×500**, **≥2 phone screenshots**, category
- **Privacy policy**: `https://remotejobs44.com/privacy`
- **Content rating** questionnaire
- **Target audience & content**
- **Data safety** (declare account/email, push, CV upload via Supabase)
- **App access** (give Google a test login if features require sign-in)
- **Ads / Government / Financial** declarations

## 4. First release → Internal testing

Testing → **Internal testing** → Create release → upload the `.aab` →
**opt into Play App Signing** when prompted (Google holds the app signing key;
your keystore is the upload key) → add testers → roll out → install via the
opt-in link and smoke-test (login, feed, apply, push).

## 5. Promote to Production

(Personal accounts: only after the 20-tester / 14-day closed test.)
Production → Create release → reuse the bundle → submit for review. First
review can take hours–days.

## 6. (Optional) Automate uploads from Codemagic

After the first manual upload, uncomment the `google_play` block in
`codemagic.yaml` (under the `android-aab` workflow's `publishing:`), then:
1. Create a Google Cloud **service account**, grant it access in Play Console
   → Users & permissions, download its JSON key.
2. Add the JSON as a **secure** Codemagic env var
   `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`.
Subsequent `android-aab` builds publish to the `internal` track as a draft.

---

## Getting a D‑U‑N‑S number (only for an Organization account)

A D‑U‑N‑S number is a free 9-digit business identifier from Dun & Bradstreet.

1. **Register the business first.** You need a legally registered entity. In
   Nigeria that's a **CAC** (Corporate Affairs Commission) registration. D&B
   issues the number against a real registered business, not an individual.
2. **Check if you already have one:** <https://www.dnb.com/duns-number/lookup.html>
3. **Request one (free):** <https://www.dnb.com/duns-number/get-a-duns.html>
   - Select your country. Nigeria is served by D&B's regional partner; the
     free request can take up to ~30 days (paid expedite is faster).
   - You'll provide the legal business name, registered address, and contact.
4. **Enter it in Play Console** during Organization sign-up. Google verifies the
   org name/address against the D‑U‑N‑S record, so they must match exactly.

> If "Nigeria" doesn't appear or the wait is too long, the practical fallback is
> a **Personal** account (no D‑U‑N‑S) — accepting the 20-tester closed-test gate.

### Using a friend's UK / Canada entity — read before you do this

You *can* register an Organization account under a friend's UK or Canadian
business, **but only if that friend is a genuine partner who will actually own
and operate the account** — because everything legal and financial attaches to
*their* entity, not yours:

- **Payouts** go to that organization's bank account in that country, under
  that country's tax rules (and Google's US tax forms for the payee).
- **Identity verification**: Google verifies the registrant's identity and the
  org's D‑U‑N‑S. The account, by their terms, belongs to whoever's identity and
  business it's registered under.
- **Risk**: registering under someone else's identity/business purely to bypass
  your own country/verification violates Play's Developer Distribution Agreement
  and can get the account **terminated and payouts frozen** — a bad outcome once
  you have real users.

**Recommendation:** if you want to ship now, use a **Personal** account in your
own name (Nigeria is supported, no D‑U‑N‑S). If you want an Organization, register
your own Nigerian business and get a Nigerian D‑U‑N‑S. Only use a friend's
foreign company if it's a real, documented partnership where they are genuinely
the account owner (and you've agreed how payouts/tax/ownership work).
