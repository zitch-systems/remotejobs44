// lib/auth/admin-2fa-server.ts — server-only email-OTP machinery for admin 2FA.
//
// SERVER ONLY (imports node `crypto`). Do not import from client components.
//
// Flow: an admin requests a code (/api/admin/2fa/send) → a 6-digit code is
// emailed to the admin mailbox and its sha256 hash stored in admin_2fa_codes →
// the admin submits the code (/api/admin/2fa/verify) → on success we set a
// signed, httpOnly session cookie that requireAdmin checks. No plaintext code
// is ever stored or put in the cookie.
import { createHmac, createHash, randomInt, timingSafeEqual } from 'crypto';

// The mailbox the login code is sent to (a fixed admin inbox, NOT the
// individual admin's address — matches the "mail to admin@remotejobs44.com"
// requirement). Overridable via env for other environments.
export const ADMIN_2FA_EMAIL = process.env.ADMIN_2FA_EMAIL || 'admin@remotejobs44.com';

export const CODE_LENGTH       = 6;
export const CODE_TTL_MS       = 10 * 60 * 1000;       // code valid 10 minutes
export const SESSION_TTL_MS    = 12 * 60 * 60 * 1000;  // verified for 12 hours
export const MAX_CODE_ATTEMPTS = 5;
export const ADMIN_2FA_COOKIE  = 'rj44_admin2fa';

// HMAC/secret for the verified-session cookie.
//
// FAIL CLOSED: a missing or weak secret must NEVER degrade to signing cookies
// with an empty (or otherwise guessable) key. If ADMIN_2FA_SECRET is absent or
// too short, secret() throws — signSession() then throws (the verify route 500s
// and issues no cookie) and verifySession() rejects every cookie. A
// misconfigured deploy therefore blocks admin access loudly instead of minting
// forgeable sessions.
//
// We deliberately no longer fall back to SUPABASE_SERVICE_ROLE_KEY: reusing the
// database key to sign auth cookies is a key-reuse smell (SECURITY_REPORT item
// #3), and the silent fallback hid misconfiguration. ADMIN_2FA_SECRET must be
// set in every environment that enables admin 2FA.
export const MIN_ADMIN_2FA_SECRET_LENGTH = 16;

function secret(): string {
  const s = process.env.ADMIN_2FA_SECRET ?? '';
  if (s.length < MIN_ADMIN_2FA_SECRET_LENGTH) {
    throw new Error(
      `ADMIN_2FA_SECRET is missing or too short (need >= ${MIN_ADMIN_2FA_SECRET_LENGTH} chars). ` +
      'Admin 2FA fails closed until it is configured.',
    );
  }
  return s;
}

/** A fresh zero-padded numeric one-time code, e.g. "048213". */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/** Hash a code bound to the user so a leaked hash can't be reused elsewhere. */
export function hashCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

export function codesMatch(storedHash: string, userId: string, submitted: string): boolean {
  const a = Buffer.from(storedHash);
  const b = Buffer.from(hashCode(userId, submitted.trim()));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Verified-session cookie: `${userId}.${expEpochMs}.${hmacHex}` ──────────────
export function signSession(userId: string, now = Date.now()): string {
  // secret() throws if unconfigured — signing fails closed rather than
  // producing a cookie signed with an empty key.
  const key = secret();
  const exp = now + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac('sha256', key).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** True when the cookie is a valid, unexpired signature for THIS user. */
export function verifySession(cookieValue: string | undefined | null, userId: string, now = Date.now()): boolean {
  if (!cookieValue) return false;
  // A misconfigured secret rejects every cookie (fail closed) instead of
  // throwing out of a plain status check.
  let key: string;
  try { key = secret(); } catch { return false; }
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = createHmac('sha256', key).update(`${uid}.${expStr}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const sessionCookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};
