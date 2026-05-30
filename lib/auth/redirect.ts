// lib/auth/redirect.ts
// Single source of truth for "where should this user land after auth?"
// Used by both the password-login flow and the OAuth callback so both honor
// the same role-based routing rules. Also enforces that a `next` URL is
// compatible with the user's role — admins are never sent to /dashboard,
// members are never sent to /admin (those would just bounce).
import { isHardcodedAdmin } from '@/lib/admin-emails';

export type Role = 'admin' | 'user';

export function resolveRole(opts: { profileRole?: string | null; email?: string | null }): Role {
  if (opts.profileRole === 'admin') return 'admin';
  if (isHardcodedAdmin(opts.email)) return 'admin';
  return 'user';
}

const ADMIN_HOME  = '/admin';
const MEMBER_HOME = '/dashboard';

// Returns the post-login destination for a given role + requested next URL.
// - If `next` is null/empty/'/login' it falls back to the role's home.
// - If `next` is incompatible with the role (e.g. member asking for /admin),
//   we ignore it and send to the role's home.
// - Only allows same-origin relative paths to prevent open-redirect attacks.
export function destinationForRole(role: Role, next?: string | null): string {
  const home = role === 'admin' ? ADMIN_HOME : MEMBER_HOME;

  if (!next || typeof next !== 'string') return home;

  // Strip tab/newline characters per WHATWG URL parsing — browsers
  // ignore them when resolving Location headers, so a value like
  // `/\tevil.com` would otherwise sail past the slash/backslash check.
  const cleaned = next.replace(/[\t\r\n]/g, '');

  // Reject anything that isn't a same-origin relative path. Backslash
  // check closes the `/\evil.com` bypass: the WHATWG URL spec normalises
  // `\` to `/` inside special schemes (http/https/ws/wss/ftp/file), so
  // `Location: /\evil.com` resolves to `http://evil.com/` in every
  // mainstream browser. Reject any next that contains a backslash.
  if (!cleaned.startsWith('/'))    return home;
  if (cleaned.startsWith('//'))    return home;
  if (cleaned.includes('://'))     return home;
  if (cleaned.includes('\\'))      return home;

  // Don't loop back to auth pages
  if (cleaned === '/login' || cleaned === '/register' || cleaned.startsWith('/auth/')) return home;

  if (role === 'admin' && cleaned.startsWith('/dashboard')) return ADMIN_HOME;
  if (role === 'user'  && cleaned.startsWith('/admin'))     return MEMBER_HOME;

  return cleaned;
}
