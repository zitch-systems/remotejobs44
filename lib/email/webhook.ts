// lib/email/webhook.ts — Svix signature verification for Resend webhooks.
//
// Resend signs webhooks with Svix. We verify by hand rather than pulling in
// the `svix` package: the scheme is a short HMAC and the dependency would be
// the only thing in the tree reaching for node crypto at request time.
//
// The endpoint is public — anyone who finds the URL can POST to it, and the
// payload it carries ("this address complained, stop mailing it") is exactly
// the shape an attacker would forge to quietly cut a user off from their
// password-reset mail. Signature verification is the only thing standing
// between that and the database, so an unverifiable request is rejected
// before the body is parsed.
import { createHmac, timingSafeEqual } from 'crypto';

/** Reject anything older than this to blunt replay of a captured request. */
const TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/**
 * Verify a Svix-signed payload.
 *
 * @param rawBody The request body EXACTLY as received. Re-serialising parsed
 *   JSON will not round-trip byte-for-byte (key order, whitespace, unicode
 *   escapes) and the HMAC would never match — read the body as text first.
 * @param headers The svix-id / svix-timestamp / svix-signature headers.
 * @param secret  The endpoint secret, `whsec_<base64>` as shown in Resend.
 * @param nowMs   Injectable clock, for tests.
 */
export function verifyResendSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  // Timestamp must be a sane, recent unix seconds value. Guard both
  // directions: a far-future stamp is as suspect as a stale one.
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return false;
  const driftSeconds = Math.abs(nowMs / 1000 - tsSeconds);
  if (driftSeconds > TOLERANCE_SECONDS) return false;

  // `whsec_` prefix is a display convention; the key material is the
  // base64 that follows it.
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return false;

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // The header carries a space-separated list of `v<version>,<signature>`
  // pairs — Svix sends more than one during a secret rotation, so a match
  // against ANY v1 entry is a pass.
  const expectedBuf = Buffer.from(expected);
  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) continue;
    const candidate = Buffer.from(value);
    // timingSafeEqual throws on a length mismatch, so check that first —
    // length is not a secret.
    if (candidate.length !== expectedBuf.length) continue;
    if (timingSafeEqual(candidate, expectedBuf)) return true;
  }
  return false;
}

/**
 * True when a bounce is permanent (the address does not and will not exist).
 *
 * Transient bounces — full mailbox, greylisting, a momentarily unreachable
 * MX — must NOT mark the address dead. They recover on their own, and
 * treating a full inbox as permanent would cut a paying subscriber off
 * from their own account mail for good.
 */
export function isPermanentBounce(bounce: unknown): boolean {
  const type = (bounce as { type?: unknown } | null)?.type;
  return typeof type === 'string' && type.toLowerCase() === 'permanent';
}

/**
 * Pull recipient addresses out of a Resend webhook payload.
 * `to` is an array in current payloads but has been a bare string, so
 * accept both rather than silently dropping the event.
 */
export function recipientsOf(data: unknown): string[] {
  const to = (data as { to?: unknown } | null)?.to;
  const list = Array.isArray(to) ? to : typeof to === 'string' ? [to] : [];
  return list
    .filter((e): e is string => typeof e === 'string')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}
