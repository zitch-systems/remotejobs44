// lib/admin-emails.ts
// Centralized list of emails granted admin access without needing a profiles.role='admin' row.
// To add an admin: either add their email here (and redeploy) or set role='admin' in the
// profiles table directly in the Supabase dashboard.
export const ADMIN_EMAILS: readonly string[] = [
  'admin@remotejobs44.com',
  'admin@remotejobs4.com',
  'zitchinfo@gmail.com',
  'teyokensax1@gmail.com',
  'mallamplacid@gmail.com',
] as const;

export function isHardcodedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
