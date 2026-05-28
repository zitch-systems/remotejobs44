// app/api/scrape/route.ts — DISABLED.
//
// This route once held an unauthenticated career-page scraper. The real
// handler was removed but the call sites in app/admin/sources/page.tsx
// and lib/ingestion.ts (tryJSONApi / tryScrape) still target it. Without
// a handler the route returns 405 Method Not Allowed today, which is
// fine — but anyone re-adding a `export async function GET/POST` here
// without admin gating + URL validation would immediately reintroduce
// an open SSRF tool (it ran with `runtime = 'edge'` and accepted any
// `?url=` query string).
//
// Until the route is rewritten with `requireAdmin()` + `validateExternalUrl()`
// + a real HTML/JSON fetch + parse pipeline, return an explicit 410 Gone
// so callers fail loudly with a structured error rather than the
// ambiguous 405.
import { NextResponse } from 'next/server';

const GONE = () => NextResponse.json(
  { error: 'Scraper route is currently disabled. Admin: see app/api/scrape/route.ts.' },
  { status: 410 }
);

export const GET    = GONE;
export const POST   = GONE;
export const PUT    = GONE;
export const PATCH  = GONE;
export const DELETE = GONE;
