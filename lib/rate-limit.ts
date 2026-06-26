// lib/rate-limit.ts
// Simple in-memory sliding-window rate limiter for Next.js API routes.
// Uses a Map stored in module scope (persists across requests within a process).
// For multi-region / multi-instance deployments, swap this for Upstash Redis.

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Prune old entries every 5 minutes to prevent memory leaks
let lastPrune = Date.now();
function maybePrune() {
  const now = Date.now();
  if (now - lastPrune < 5 * 60 * 1000) return;
  lastPrune = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export interface RateLimitResult {
  success:   boolean;
  remaining: number;
  resetAt:   number;
}

/**
 * Check rate limit for a given key.
 * @param key      Unique identifier (e.g. IP + route)
 * @param limit    Max requests per window
 * @param windowMs Window size in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  maybePrune();
  const now  = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Refund a single token previously consumed via rateLimit(). Use when the
 * guarded action failed for a reason that shouldn't count against the
 * caller's budget (e.g. a server-side error that created no real resource).
 * No-op if the key is unknown or its window has already reset; never drops
 * the count below zero.
 */
export function releaseRateLimit(key: string): void {
  const entry = store.get(key);
  if (entry && entry.resetAt > Date.now() && entry.count > 0) {
    entry.count -= 1;
  }
}

/** Extract the best available IP from a Next.js request */
export function getIP(req: Request): string {
  const headers = new Headers((req as Request).headers);
  // Prefer x-real-ip: on Vercel the platform sets this to the verified client
  // IP and overwrites any client-supplied value, so it can't be spoofed. The
  // FIRST hop of x-forwarded-for IS client-controllable (a request can send its
  // own `X-Forwarded-For: <anything>`, and that value lands at the front), so
  // keying limits on it lets an attacker rotate it to defeat the cap. Only fall
  // back to x-forwarded-for when x-real-ip is absent (local/dev), and take the
  // last hop (added by the nearest proxy) rather than the spoofable first one.
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return 'unknown';
}
