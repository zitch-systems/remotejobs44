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

/** Extract the best available IP from a Next.js request */
export function getIP(req: Request): string {
  const headers = new Headers((req as Request).headers);
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}
