// lib/admin/auth.ts — shared admin-route guard.
//
// Returns one of:
//   { ok: true,  adminId, adminEmail }         when caller is an admin
//   { ok: false, res: NextResponse(401) }      when no session at all
//   { ok: false, res: NextResponse(403) }      when authed but not admin
//
// Centralising this keeps the 401/403 distinction consistent — previously
// /api/admin/companies returned 403 for both cases while /api/admin/users
// returned 401 for unauth and 403 for not-admin, which made client error
// handling needlessly fiddly.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { ADMIN_MFA_REQUIRED, getCurrentAAL } from '@/lib/auth/mfa';

export type RequireAdminResult =
  | { ok: true;  adminId: string; adminEmail: string | null }
  | { ok: false; res: NextResponse };

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, suspended')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin' || isHardcodedAdmin(user.email);
  if (!isAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  // Suspended admins are denied EVEN IF in the hardcoded admin list. Without
  // this kill-switch, a compromised admin account couldn't be revoked short
  // of a redeploy. migration_v4 introduced the `suspended` column for this.
  if (profile?.suspended === true) {
    return { ok: false, res: NextResponse.json({ error: 'Account suspended' }, { status: 403 }) };
  }
  // Two-factor gate (when enabled): an admin must have completed a TOTP
  // challenge this session (aal2). Returns a distinct `code: 'mfa_required'`
  // so the admin UI can route them to /security/2fa to enroll/verify. The 2FA
  // flow itself talks to Supabase Auth directly (not /api/admin), so it isn't
  // blocked by this gate.
  if (ADMIN_MFA_REQUIRED) {
    const aal = await getCurrentAAL(supabase);
    if (aal !== 'aal2') {
      return {
        ok: false,
        res: NextResponse.json(
          { error: 'Two-factor authentication required', code: 'mfa_required' },
          { status: 403 },
        ),
      };
    }
  }
  return { ok: true, adminId: user.id, adminEmail: user.email ?? null };
}
