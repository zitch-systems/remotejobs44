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
│   ├── dashboard/
│   │   └── page.tsx
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
│   ├── profile/
│   │   └── page.tsx
│   ├── applications/
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
│   │   ├── HeroSection.tsx
│   │   ├── CategoriesSection.tsx
│   │   ├── FeaturedJobs.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── PricingPreview.tsx
│   │   └── CTASection.tsx
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
├── tailwind.config.ts     ← at root level
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
PAYSTA