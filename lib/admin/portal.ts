// lib/admin/portal.ts
//
// The admin portal is no longer reachable at the public /admin URL. It now
// lives behind an unguessable, env-configured "knock" link. The flow (all of
// it enforced in middleware.ts):
//
//   1. An operator opens their private link:  https://<host>/<slug>
//   2. Middleware mints a signed, http-only access cookie and redirects to
//      /admin.
//   3. /admin and every /admin/* page returns 404 UNLESS that access cookie is
//      present — so to anyone who has NOT opened the private link, the admin
//      area simply does not exist on remotejobs44.com.
//
// This is deliberate obscurity in front of the REAL gate, not a replacement for
// it: every /api/admin/* route still enforces requireAdmin() (session + role +
// optional email 2FA) and middleware still role-gates the /admin pages. The
// slug only decides who can SEE the entrance; it never grants privileges.
//
// The slug is read from a SERVER-ONLY env var (no NEXT_PUBLIC_ prefix) and is
// referenced only from middleware / server code, so it is never compiled into a
// browser bundle. Rotate it by changing ADMIN_PORTAL_SLUG in the environment
// and redeploying (the value is captured at build time for the Edge runtime).
//
// SECURITY NOTE: there is deliberately no committed fallback. If the variable
// is absent or invalid the private entrance and all admin pages fail closed.

// Non-secret domain-separation string folded into the cookie token so the
// cookie value is not literally the slug.
const TOKEN_PEPPER = 'rj44-portal-access-v1';

/** Name of the cookie that proves a visitor arrived via the private link. */
export const ADMIN_PORTAL_COOKIE = 'rj_portal';

// 180 days: the operator knocks once per browser and the entrance stays
// unlocked. The real admin auth (session + role + 2FA) still runs on every
// single request, so a long-lived knock cookie widens nothing but convenience.
export const ADMIN_PORTAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

function normalizeSlug(raw: string | undefined): string {
  // Trim whitespace + surrounding slashes and collapse to a single top-level
  // path segment (everything before the first internal slash), so the knock
  // route is always one clean segment: /<slug>.
  const cleaned = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  const seg = cleaned.split('/')[0];
  // Never let the entrance collide with a real gated route.
  const RESERVED = new Set(['admin', 'dashboard', 'agent', 'api', 'login', 'register', 'auth']);
  if (!seg || RESERVED.has(seg.toLowerCase())) return '';
  return seg;
}

/** The single path segment that unlocks the portal. Empty means disabled. */
export const ADMIN_PORTAL_SLUG = normalizeSlug(process.env.ADMIN_PORTAL_SLUG);
export const ADMIN_PORTAL_CONFIGURED = ADMIN_PORTAL_SLUG.length > 0;

/** The private entrance path, or null when configuration is invalid. */
export const ADMIN_PORTAL_PATH = ADMIN_PORTAL_CONFIGURED ? `/${ADMIN_PORTAL_SLUG}` : null;

// The slug can't change inside a running process, so compute the token once.
let cachedToken: Promise<string> | null = null;

/**
 * Value the access cookie must hold: SHA-256(slug + pepper). It cannot be
 * forged without knowing the slug, and the cookie never carries the slug in the
 * clear. Async because it uses Web Crypto (available in both the Edge runtime
 * and Node).
 */
export function adminPortalToken(): Promise<string> {
  if (!ADMIN_PORTAL_CONFIGURED) {
    return Promise.reject(new Error('ADMIN_PORTAL_SLUG is not configured'));
  }
  if (!cachedToken) {
    cachedToken = (async () => {
      const data = new TextEncoder().encode(`${ADMIN_PORTAL_SLUG}:${TOKEN_PEPPER}`);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    })();
  }
  return cachedToken;
}
