// lib/auth/mfa.ts — admin two-factor-auth (TOTP) enforcement.
//
// Admins can be required to complete a TOTP 2FA challenge (Authenticator
// Assurance Level 2, "aal2") before reaching the admin area or any /api/admin
// route. Enforcement is OFF by default so deploying this feature can never lock
// an admin out before they've enrolled an authenticator.
//
// ROLLOUT (lockout-safe):
//   1. Deploy with NEXT_PUBLIC_ADMIN_MFA_REQUIRED unset/false. Nothing changes;
//      admins can still enroll voluntarily at /security/2fa.
//   2. The admin enrolls a TOTP app at /security/2fa (scan QR, enter code).
//   3. Set NEXT_PUBLIC_ADMIN_MFA_REQUIRED=true and redeploy. From then on,
//      admins are bounced to /security/2fa to verify before admin access.
//
// LOST AUTHENTICATOR: remove the user's factor from the Supabase dashboard
// (Auth → Users → the admin → MFA), or run `auth.mfa.unenroll` as that user,
// then they can re-enroll. With the flag off, admin access is unaffected.
import type { SupabaseClient } from '@supabase/supabase-js';

// Whether admins must reach aal2 for admin access. Public (it's not a secret
// whether 2FA is on) so the client admin layout and the server gate read the
// same flag.
export const ADMIN_MFA_REQUIRED = process.env.NEXT_PUBLIC_ADMIN_MFA_REQUIRED === 'true';

export type AAL = 'aal1' | 'aal2' | null;

/**
 * The current Authenticator Assurance Level of the caller's session, read from
 * the (signed) access-token `aal` claim. 'aal2' means a TOTP challenge has been
 * completed this session. Returns null on any error (treated as not-aal2).
 */
export async function getCurrentAAL(supabase: SupabaseClient): Promise<AAL> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return (data?.currentLevel as AAL) ?? null;
  } catch {
    return null;
  }
}

/** True when enforcement is on AND the session hasn't cleared a 2FA challenge. */
export function mustChallengeForAdmin(aal: AAL): boolean {
  return ADMIN_MFA_REQUIRED && aal !== 'aal2';
}
