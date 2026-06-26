// lib/admin/auth.ts — shared admin-route guard.
//
// requireAdmin() returns one of:
//   { ok: true,  adminId, adminEmail }         when caller is an admin
//   { ok: false, res: NextResponse(401) }      when no session at all
//   { ok: false, res: NextResponse(403) }      when authed but not admin,
//                                               suspended, or 2FA not satisfied
//
// getAdminUser() is the same admin check WITHOUT the 2FA gate — used only by
// the /api/admin/2fa/* endpoints (which must be reachable so the admin can
// pass 2FA in the first place).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { ADMIN_MFA_REQUIRED } from '@/lib/auth/mfa';
import { ADMIN_2FA_COOKIE, verifySession } from '@/lib/auth/admin-2fa-server';

export type RequireAdminResult =
  | { ok: true;  adminId: string; adminEmail: string | null }
  | { ok: false; res: NextResponse };

/** Admin check without the 2FA gate. Used by the 2FA endpoints themselves. */
export async function getAdminUser(): Promise<RequireAdminResult> {
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
  return { ok: true, adminId: user.id, adminEmail: user.email ?? null };
}

export async function requireAdmin(): Promise<RequireAdminResult> {
  const base = await getAdminUser();
  if (!base.ok) return base;

  // Two-factor gate (when enabled): the admin must have a valid email-2FA
  // session cookie (set by /api/admin/2fa/verify). Returns a distinct
  // `code: 'mfa_required'` so the admin UI can route to /security/2fa. The 2FA
  // endpoints use getAdminUser (no gate), so they're reachable beforehand.
  if (ADMIN_MFA_REQUIRED) {
    const cookieStore = await cookies();
    const verified = verifySession(cookieStore.get(ADMIN_2FA_COOKIE)?.value, base.adminId);
    if (!verified) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: 'Two-factor authentication required', code: 'mfa_required' },
          { status: 403 },
        ),
      };
    }
  }
  return base;
}
