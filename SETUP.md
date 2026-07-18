# RemoteJobs44 — Setup Guide

## ⚠️ Common Build Error Fix

If you see:
```
Error: Couldn't find a `pages` directory
```

This means your folder structure is wrong. The `app/` folder must be at the **same level** as `package.json`.

## ✅ Correct folder structure

Your project folder on your computer must look exactly like this:

```
remotejobs44/          ← this is your project root
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── (member)/          ← route group: member-only screens
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── profile/
│   │   │   └── page.tsx
│   │   └── applications/
│   │       └── page.tsx
│   ├── jobs/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   ├── pricing/
│   │   └── page.tsx
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts
│   ├── admin/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── sources/
│   │   │   └── page.tsx
│   │   ├── vc-boards/
│   │   │   └── page.tsx
│   │   ├── company-import/
│   │   │   └── page.tsx
│   │   └── jobs/
│   │       └── new/
│   │           └── page.tsx
│   └── api/
│       ├── paystack/
│       │   ├── initialize/route.ts
│       │   ├── verify/route.ts
│       │   └── webhook/route.ts
│       ├── ats/route.ts
│       ├── rss/route.ts
│       ├── scrape/route.ts
│       └── yc/route.ts
├── components/
│   ├── home/
│   │   └── deep-ocean/
│   │       ├── Hero.tsx
│   │       ├── Categories.tsx
│   │       ├── Featured.tsx
│   │       ├── HowItWorks.tsx
│   │       ├── Pricing.tsx
│   │       └── CtaBand.tsx
│   ├── jobs/
│   │   ├── JobCard.tsx
│   │   └── PaywallModal.tsx
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── BottomNav.tsx
│   ├── providers/
│   │   └── ThemeProvider.tsx
│   └── ui/
│       ├── Modal.tsx
│       └── ToastContainer.tsx
├── hooks/
│   └── usePaystack.ts
├── lib/
│   ├── api.ts
│   ├── ats-engine.ts
│   ├── ingestion.ts
│   ├── mock-data.ts
│   ├── store.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── vc-boards.ts
│   └── supabase/
│       ├── client.ts
│       └── server.ts
├── public/
│   ├── manifest.json
│   └── icons/
│       └── favicon.svg
├── supabase/
│   ├── schema.sql
│   └── migration_v2.sql
├── middleware.ts          ← at root level, NOT inside app/
├── next.config.js         ← at root level
├── tailwind.config.js     ← at root level
├── tsconfig.json          ← at root level
├── postcss.config.js      ← at root level
└── package.json           ← at root level
```

## ❌ Wrong structure (causes the build error)

```
remotejobs44/
└── files (1)/         ← DON'T run npm here
    ├── app/
    └── package.json
```

## How to fix it

1. Open your project folder in Windows Explorer
2. Go into the `files (1)` folder (or whatever it's called)
3. Select ALL files and folders inside it
4. Cut them (Ctrl+X)
5. Go UP one level (back to `remotejobs44/`)
6. Paste them there (Ctrl+V)
7. Now run `npm install` then `npm run build` from `remotejobs44/`

OR in PowerShell:
```powershell
# Navigate to where your files actually are
cd "C:\Users\Adeta\OneDrive\Documents\remotejobs44\files (1)"

# Check package.json is here
ls package.json

# Run build from HERE (where package.json is)
npm run build
```

## Environment variables (.env.local)

Create a file called `.env.local` at the project root:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

No Paystack plan codes are needed — every tier is charged as a one-time
amount defined in `lib/paystack/plans.ts` (`PLAN_AMOUNTS_KOBO`). See
`.env.example` for the full annotated list of variables (cron secret,
`ADMIN_PORTAL_SLUG` — the private admin entrance, admin 2FA, AI key
encryption, error reporting, ingestion sources).

The admin area is no longer at the public `/admin` URL: it answers 404 unless
you first open the private link `https://<your-domain>/<ADMIN_PORTAL_SLUG>`,
which unlocks it for that browser. See `docs/AUTH_AND_ADMIN.md`.

## Vercel deployment region (`vercel.json` → `regions`)

`vercel.json` pins all Serverless Functions to **`dub1`** (AWS `eu-west-1`,
Dublin) — the SAME region as the Supabase project. JSON can't carry
comments, so the rationale lives here:

Without the pin, functions default to `iad1` (US East) and every SSR
render / API call pays a transatlantic round-trip PER Supabase query.
`/jobs` and `/jobs/[id]` run their auth getUser → profiles → jobs reads
mostly sequentially, stacking 3–4 × ~90ms of pure network on top of query
time — the bulk of the site's 1.6–2s P75 TTFB. Co-locating compute with
the database collapses those hops to ~1–3ms.

If the Supabase project is ever migrated to another region, update
`regions` in `vercel.json` to the matching Vercel region ID at the same
time (region map: https://vercel.com/docs/edge-network/regions).
