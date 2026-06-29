# API & data model — RemoteJobs44

The prototypes ship an in-memory mock (`design_files/app/data.js`, `design_files/web/shared.js`).
Its **shapes are the contract** — keep them and swap the mock bodies for real `fetch()` calls so
the UI keeps working unchanged. Below: (1) the TypeScript domain model, (2) a proposed REST API,
(3) the client-side seam and state stores.

---

## 1. Domain types

```ts
// ---- Jobs ----------------------------------------------------------------
export type Category =
  | 'VA' | 'Support' | 'Marketing' | 'Data'
  | 'Product' | 'Engineering' | 'Sales' | 'Design';

export type JobType   = 'Full-time' | 'Part-time' | 'Contract';
export type Region    = 'Worldwide' | 'EMEA' | 'Americas';      // public site adds 'Remote-first'
export type Level     = 'Entry' | 'Mid' | 'Senior' | 'Lead';

export interface Job {
  id:        string;          // 'j7'
  slug:      string;          // 'senior-software-engineer-vercel' (derive for URLs)
  role:      string;          // 'Senior Software Engineer'
  company:   string;          // 'Vercel'  (key into Company)
  category:  Category;        // 'Engineering'
  type:      JobType;
  region:    Region;
  level:     Level;
  pay:       string;          // display string, e.g. '$120k–160k' or '$1.2k–2k/mo'
  posted:    string;          // relative, e.g. '2h' | '1d' | '3d'
  postedAt:  string;          // ISO timestamp (server truth; derive `posted` from it)
  match:     number;          // 0–100 personalised match score
  verified:  boolean;
  featured?: boolean;
  about:     string;          // role summary paragraph
  duties:    string[];        // 'What you'll do' checklist
  requirements?: string[];    // 'What we're looking for'
  skills?:   string[];        // tag row
}

export interface Company {
  name:   string;             // 'Vercel'
  domain: string;             // 'vercel.com'  → logo lookup
  icon?:  string;             // simpleicons slug, optional
  about?: string;
}

export interface CategoryMeta {
  key:   Category;
  label: string;              // 'Virtual Assistant'
  count: string;              // '2.1k' (display) — server returns a number, format client-side
}

// ---- Member ---------------------------------------------------------------
export type AppStage = 'Saved' | 'Applied' | 'Interview' | 'Offer';

export interface Application {
  id:        string;
  jobId:     string;
  stage:     AppStage;
  note?:     string;          // 'Interview scheduled', 'Offer received'…
  updatedAt: string;          // ISO
}

export interface Profile {
  name:        string;        // 'Ada Obi'
  title:       string;        // 'Virtual Assistant'
  location:    string;        // 'Remote · Lagos, NG'
  avatarUrl?:  string;
  headline?:   string;
  skills:      string[];
  cvUrl?:      string;
  strength:    number;        // 0–100 profile-completeness (dashboard "Profile strength")
}

export interface Subscription {
  plan:        'free' | 'pro';
  renewsAt?:   string;        // ISO, when pro
  price?:      string;        // 'Day Pass $3' | 'Pro $19/mo'
}

export type AlertKind = 'match' | 'status' | 'tip' | 'system';

export interface Alert {           // member web "Alerts" + mobile "Notifications"
  id:      string;
  kind:    AlertKind;
  text:    string;
  at:      string;               // ISO; render as '2h ago'
  unread:  boolean;
}

export interface SavedSearch {
  id:      string;
  label:   string;               // 'Engineering · Remote · Senior'
  query:   JobQuery;
  digest:  boolean;              // email the daily digest?
}

// ---- Tools ----------------------------------------------------------------
export interface MatchReport {            // Job Match screen
  score:    number;                       // 0–100
  covered:  number; total: number;        // 'covers 17 of 20 signals'
  matched:  string[];                     // keywords present
  gaps:     string[];                     // missing
  partial:  string[];                     // partial
  tips:     string[];                     // 'How to win this one'
}

export interface InterviewSession {       // AI Interview screen
  id:        string;
  jobId:     string;
  questions: { id: string; topic: string; prompt: string; hint?: string }[];
  answers:   Record<string /*qId*/, { text: string; scores: InterviewScores }>;
  overall:   number;                      // running score
  remaining: number;                      // sessions left
}
export interface InterviewScores { clarity: number; depth: number; structure: number; keywords: number; }

export interface CoverLetter {
  id?: string; jobId?: string;
  jobTitle: string; company: string;
  tone: 'Professional' | 'Enthusiastic' | 'Concise' | 'Conversational';
  keyPoints: string; body: string;
}
```

---

## 2. Proposed REST API

JSON over HTTPS; cursor-or-page pagination; auth via session cookie or `Authorization: Bearer`.
Job counts on the marketing site ("70,000+", "1,284 matching roles") come from the server's
`total`, not the page length.

### Public — jobs
```
GET  /api/jobs
       ?q=&category=&region=&type=&level=&sort=newest|match|pay&page=1&pageSize=20
     → { items: Job[], total: number, page: number, pageSize: number }

GET  /api/jobs/:slug                 → Job
GET  /api/jobs/:slug/similar?limit=4 → Job[]        // "Similar roles" aside
GET  /api/categories                 → CategoryMeta[]
GET  /api/companies/:domain          → Company
```

### Auth
```
POST /api/auth/signup   { name, email, password }     → { user, session }
POST /api/auth/login    { email, password }            → { user, session }
POST /api/auth/oauth    { provider: 'google'|'github'|'linkedin' } → redirect
POST /api/auth/logout                                  → 204
```

### Member — saved / applications
```
GET    /api/me/saved                          → Job[]
POST   /api/me/saved        { jobId }          → 201
DELETE /api/me/saved/:jobId                    → 204

GET    /api/me/applications                    → Application[]      // drives the kanban + dashboard tracker
POST   /api/me/applications { jobId, note? }   → Application        // stage defaults 'Applied'
PATCH  /api/me/applications/:id { stage, note? } → Application      // move across kanban columns
```

### Member — profile / subscription / alerts
```
GET   /api/me/profile                 → Profile
PATCH /api/me/profile { …Partial }    → Profile
GET   /api/me/subscription            → Subscription
POST  /api/me/subscription/upgrade { plan: 'pro' | 'daypass' } → Subscription
POST  /api/me/subscription/cancel     → Subscription

GET   /api/me/alerts                  → Alert[]
POST  /api/me/alerts/read-all         → 204
GET   /api/me/saved-searches          → SavedSearch[]
POST  /api/me/saved-searches { label, query, digest } → SavedSearch
```

### Tools (AI-backed — stream where it helps)
```
POST /api/tools/match        { jobId? , jobDescription, cvId? }     → MatchReport
POST /api/tools/cover-letter { jobTitle, company, tone, keyPoints } → { body: string }   // stream
GET  /api/tools/interview/:jobId                                    → InterviewSession    // questions
POST /api/tools/interview/:sessionId/answer { questionId, text }    → { scores, overall, feedback }
GET  /api/tools/cv                                                  → CvDocument
PUT  /api/tools/cv { …sections }                                    → { cv, strength }
GET  /api/tools/cv/export?format=pdf|docx                           → file
```

### Dashboard
```
GET /api/me/dashboard
  → { stats: { activeApplications, interviews, saved, profileStrength },
      tracker: Application[], matches: Job[], cv: { strength, tips: string[] }, topAlert?: Alert }
```

---

## 3. Client seam & state

**The single seam** the prototypes expose (replace bodies with `fetch`, keep signatures):

```ts
// design_files/app/data.js  → port to lib/api.ts
API.listJobs({ q, cat, type, region })   // → Job[]
API.getJob(id)                            // → Job | null
API.categories()                          // → CategoryMeta[]
API.signIn({ email })                     // → { id, name, email }
```

**Web mock data**: `design_files/web/shared.js` (50 marquee companies, `JOBS`, `CAT_TINT`,
render helpers, `countUp`, `wireSearch`, `initTheme`).
**App mock data**: `design_files/app/data.js` (12 seed roles, 8 `CATEGORIES`, 12 `COMPANIES`,
`GRADS`, `logoFor`).

**Mobile app store** — `localStorage` key `rj44_app_v1`:
```ts
{ user: User | null, theme: 'light'|'dark', pro: boolean,
  prefs: { push: boolean, alerts: boolean },
  saved: string[],                                  // jobIds
  applied: Record<string, { status: AppStage, at: number }>,
  profile: Profile, notifs: Alert[], onboarded: boolean }
```
Methods: `signIn/signOut`, `setTheme/toggleTheme`, `upgrade/cancelPro`, `setPref`,
`isSaved/toggleSave`, `appStatus/hasApplied/apply/setAppStatus`, `updateProfile`,
`unreadCount/markNotifsRead`. The store emits `change`; screens re-render.

**Web theme** persists to `localStorage` `rj44-theme-b` (marketing) / `rj44-theme-dash` (member).

> Seed roles (use as fixtures): Andela VA · Intercom CSR · Buffer Social · Canva Digital Mktg ·
> Flutterwave Data Analyst · Paystack PM · Vercel Sr SWE · Shopify Sales Mgr · Zapier CSM ·
> Notion FE · Kuda Growth · Remote.com EA. Categories: VA / Support / Marketing / Data / Product /
> Engineering / Sales / Design.
