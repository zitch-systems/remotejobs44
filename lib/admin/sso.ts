// lib/admin/sso.ts
//
// Cross-project admin single sign-on (SSO) handoff token.
//
// When an authenticated RemoteJobs44 admin clicks "Switch to <sibling>", the
// switch route mints one of these short-lived, HMAC-signed tokens carrying the
// admin's email and hands it to the sibling app (which shares ADMIN_SSO_SECRET).
// The sibling verifies it and logs that admin in without a second password
// prompt — but ONLY if the email already belongs to an admin account there.
//
// The token is NOT a credential by itself: it merely attests "this email is a
// verified admin on the issuing app" for ~60 seconds. It grants no privileges;
// the receiving app decides whether that email is one of its own admins and
// still runs its normal admin gate on every page. Both sides must hold the same
// ADMIN_SSO_SECRET (a strong random value; generate with `openssl rand -hex 32`).
import crypto from 'node:crypto';

const DEFAULT_TTL_SECONDS = 60;

export interface HandoffPayload {
  email: string;
  iat: number;
  exp: number;
  nonce: string;
}

function sign(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/** Mint a signed handoff token for `email`. Returns null when unconfigured. */
export function mintHandoffToken(
  email: string | null | undefined,
  secret: string | undefined,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string | null {
  if (!secret || !email) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: HandoffPayload = {
    email: email.toLowerCase(),
    iat: now,
    exp: now + ttlSeconds,
    nonce: crypto.randomBytes(9).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** Verify a handoff token. Returns the payload, or null if invalid/expired. */
export function verifyHandoffToken(
  token: string | null | undefined,
  secret: string | undefined,
): HandoffPayload | null {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Constant-time compare; timingSafeEqual throws on length mismatch.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: HandoffPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
