// lib/auth/mfa.ts — admin 2FA config shared by client + server.
//
// Client-safe ONLY: this module is imported by the admin layout (a client
// component), so it must not pull in node-only modules (crypto, fs). The
// server-side code/cookie machinery lives in ./admin-2fa-server.
//
// Admins can be required to complete an email one-time-code challenge before
// the admin area or any /api/admin route. Enforcement is OFF by default so
// shipping the feature can't lock an admin out before it's wired up.
//
// ROLLOUT (lockout-safe):
//   1. Deploy with NEXT_PUBLIC_ADMIN_MFA_REQUIRED unset/false — nothing changes.
//   2. Confirm the admin mailbox (admin@remotejobs44.com) receives mail and
//      that RESEND_API_KEY is set, by sending a test code at /security/2fa.
//   3. Set NEXT_PUBLIC_ADMIN_MFA_REQUIRED=true and redeploy → enforcement live.

// Whether admins must pass the email-code challenge for admin access. Public —
// it's not a secret whether 2FA is on.
export const ADMIN_MFA_REQUIRED = process.env.NEXT_PUBLIC_ADMIN_MFA_REQUIRED === 'true';

// Display-only address shown on the 2FA screen. The authoritative send target
// is resolved server-side (see admin-2fa-server.ADMIN_2FA_EMAIL).
export const ADMIN_2FA_EMAIL_DISPLAY =
  process.env.NEXT_PUBLIC_ADMIN_2FA_EMAIL || 'admin@remotejobs44.com';
