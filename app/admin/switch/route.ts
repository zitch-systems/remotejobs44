// app/admin/switch/route.ts
//
// Cross-project admin switcher target. The admin sidebar's "Switch to <project>"
// control links here; this route redirects to the sibling project's admin.
//
// The sibling's admin URL lives in a SERVER-ONLY env var (ADMIN_SIBLING_URL) so
// the sibling's private admin path never ships in this app's public JS bundles
// (Next static chunks are fetchable by anyone). Only the sibling's display name
// (NEXT_PUBLIC_ADMIN_SIBLING_NAME) is exposed to the client, for the button
// label. Reachable only from inside the admin area — the middleware knock-gate
// plus requireAdmin() below both apply.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { mintHandoffToken } from '@/lib/admin/sso';

export const dynamic = 'force-dynamic';

// Sibling admin entrance. Defaults to TransformCV's admin so the switcher works
// out of the box; override with the ADMIN_SIBLING_URL env var. Server-only, so
// this never ships in the public bundle.
const DEFAULT_SIBLING_URL = 'https://transformcv.vercel.app/ops-51b28e9e';

function siblingUrl(): string | null {
  const raw = (process.env.ADMIN_SIBLING_URL || DEFAULT_SIBLING_URL).trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const gate = await requireAdmin();
  // Not a verified admin (no session, wrong role, or 2FA unsatisfied) — bounce
  // back into the gated area, which re-runs the full check. Never reveal the
  // sibling URL to a non-admin.
  if (!gate.ok) return NextResponse.redirect(new URL('/admin', request.url));

  const dest = siblingUrl();
  // Unconfigured (or malformed) — no-op back to the overview rather than error.
  if (!dest) return NextResponse.redirect(new URL('/admin', request.url));

  // Single sign-on: when a shared ADMIN_SSO_SECRET is configured, hand the admin
  // off with a short-lived signed token so the sibling app logs them straight in
  // (no second password). Without the secret — or if anything about the token
  // build fails — fall back to a plain redirect to the sibling's admin entrance,
  // which simply prompts its own sign-in. Never a dead end either way.
  const token = mintHandoffToken(gate.adminEmail, process.env.ADMIN_SSO_SECRET);
  if (token) {
    try {
      const sso = new URL(dest);
      sso.pathname = `${sso.pathname.replace(/\/+$/, '')}/sso`;
      sso.searchParams.set('token', token);
      return NextResponse.redirect(sso.toString());
    } catch {
      /* fall through to the plain redirect below */
    }
  }
  return NextResponse.redirect(dest);
}
