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

// HMAC/secret. Prefer a dedicated secret; fall back to the service-role key,
// which is always present server-side and never shipped to the client.
function secret(): string {
  return process.env.ADMIN_2FA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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
  const exp = now + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** True when the cookie is a valid, unexpired signature for THIS user. */
export function verifySession(cookieValue: string | undefined | null, userId: string, now = Date.now()): boolean {
  if (!cookieValue || !secret()) return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = createHmac('sha256', secret()).update(`${uid}.${expStr}`).digest('hex');
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
