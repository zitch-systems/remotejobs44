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

  // Reject anything that isn't a same-origin relative path
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://')) return home;

  // Don't loop back to auth pages
  if (next === '/login' || next === '/register' || next.startsWith('/auth/')) return home;

  if (role === 'admin' && next.startsWith('/dashboard')) return ADMIN_HOME;
  if (role === 'user'  && next.startsWith('/admin'))     return MEMBER_HOME;

  return next;
}
