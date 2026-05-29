// lib/admin-emails.ts
// Emails granted admin access without needing a profiles.role='admin' row.
//
// Source precedence:
//   1. HARDCODED_ADMIN_EMAILS env var (comma-separated). Server-only — does
//      not ship to the browser bundle. Rotate via Vercel env without a code
//      change.
//   2. Compile-time fallback (FALLBACK_ADMINS below) so a fresh deploy with
//      no env var still has at least one route-in admin.
//
// Either way, ALL admin checks go through requireAdmin() in lib/admin/auth.ts,
// which also honours the profiles.suspended kill-switch — so even a hardcoded
// admin can be revoked without a redeploy.
const FALLBACK_ADMINS: readonly string[] = [
  'admin@remotejobs44.com',
];

function parseEnvAdmins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// Computed once at module load — env vars don't change at runtime in a
// serverless function, and recomputing per-request would just add overhead.
const RESOLVED_ADMINS: readonly string[] = (() => {
  const env = parseEnvAdmins(process.env.HARDCODED_ADMIN_EMAILS);
  return env.length > 0 ? env : FALLBACK_ADMINS.map(e => e.toLowerCase());
})();

export const ADMIN_EMAILS: readonly string[] = RESOLVED_ADMINS;

export function isHardcodedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return RESOLVED_ADMINS.includes(email.toLowerCase());
}
