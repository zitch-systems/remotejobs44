// lib/email/unsubscribe.ts — signed one-click unsubscribe links.
//
// Bulk mail (daily job alerts, admin broadcasts) previously shipped with no
// List-Unsubscribe header and no unsubscribe link — the alert footer pointed
// at /profile, which is behind a login. That is a problem on two fronts:
//
//   * Deliverability. Gmail and Yahoo's bulk-sender requirements expect a
//     List-Unsubscribe header plus RFC 8058 one-click support. Without it,
//     recipients reach for "report spam" instead, and a spam-complaint rate
//     above ~0.3% degrades delivery for every message from the domain —
//     including the transactional confirm-email and password-reset mail that
//     signup depends on.
//   * The opt-out has to work for someone who is not signed in. Requiring a
//     login to stop receiving mail is the thing that generates the complaint.
//
// Design: the link carries the user id, the topic, and an HMAC over both. No
// expiry — an unsubscribe link at the bottom of a year-old email should still
// work — and the token grants exactly one capability (flip one email
// preference to false for one user). It is not a session and cannot be used
// to read anything.
import { createHmac, timingSafeEqual } from 'crypto';

/** Preference keys in profiles.email_prefs that a link may switch off. */
export const UNSUBSCRIBE_TOPICS = ['marketing', 'job_alerts', 'product_updates'] as const;
export type UnsubscribeTopic = (typeof UNSUBSCRIBE_TOPICS)[number];

// `billing` is deliberately absent: receipts, failed-payment notices and
// similar are transactional mail about money the user owes or has paid, and
// are not subject to opt-out.
export function isUnsubscribeTopic(v: unknown): v is UnsubscribeTopic {
  return typeof v === 'string' && (UNSUBSCRIBE_TOPICS as readonly string[]).includes(v);
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com').replace(/\/+$/, '');

// Domain separator so a signature minted here can never be replayed against
// some other HMAC that happens to share the key material.
const SIGNING_CONTEXT = 'rj44-email-unsubscribe-v1';

/**
 * Signing key. EMAIL_UNSUBSCRIBE_SECRET is preferred; the service-role key is
 * the fallback so this works on existing deployments without a new env var.
 * Rotating either invalidates previously-issued links, which for an
 * unsubscribe link means the user lands on a "link is not valid" page with a
 * route to /profile — degraded, not dangerous.
 */
function signingKey(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET
      ?? process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? null;
}

function sign(userId: string, topic: string, key: string): string {
  return createHmac('sha256', key)
    .update(`${SIGNING_CONTEXT}:${userId}:${topic}`)
    .digest('base64url');
}

/**
 * Token proving the bearer received an email addressed to `userId` about
 * `topic`. Returns null when no key is configured — callers should then omit
 * the unsubscribe affordance rather than emit a link that can't be honoured.
 */
export function unsubscribeToken(userId: string, topic: UnsubscribeTopic): string | null {
  const key = signingKey();
  if (!key) return null;
  return sign(userId, topic, key);
}

/** Absolute URL for the unsubscribe endpoint, or null when unsigned. */
export function unsubscribeUrl(userId: string, topic: UnsubscribeTopic): string | null {
  const token = unsubscribeToken(userId, topic);
  if (!token) return null;
  const q = new URLSearchParams({ u: userId, t: topic, s: token });
  return `${APP_URL}/api/email/unsubscribe?${q.toString()}`;
}

/** Constant-time verification of a token produced by unsubscribeToken(). */
export function verifyUnsubscribeToken(
  userId: string,
  topic: string,
  token: string | null | undefined,
): boolean {
  const key = signingKey();
  if (!key || !token || !userId || !isUnsubscribeTopic(topic)) return false;

  const expected = Buffer.from(sign(userId, topic, key));
  const provided = Buffer.from(token);
  // timingSafeEqual throws on a length mismatch, which is itself a (harmless)
  // early exit — the length of an HMAC-SHA256 digest is public.
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/**
 * List-Unsubscribe / List-Unsubscribe-Post headers for a bulk message.
 *
 * The -Post header opts into RFC 8058 one-click: the mail client POSTs to the
 * URL itself, with no user-visible landing page and no confirmation step.
 * Both headers must be present for Gmail to show its native "Unsubscribe"
 * control, and the endpoint must therefore accept POST — see
 * app/api/email/unsubscribe/route.ts.
 *
 * Returns an empty object when the link can't be signed, so spreading the
 * result into sendEmail() is always safe.
 */
export function unsubscribeHeaders(
  userId: string,
  topic: UnsubscribeTopic,
): Record<string, string> {
  const url = unsubscribeUrl(userId, topic);
  if (!url) return {};
  return {
    'List-Unsubscribe':      `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
