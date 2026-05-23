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

/**
 * Check if a request is within rate limit.
 *
 * @param key      Unique identifier — e.g. IP address or user ID
 * @param limit    Max requests allowed in the window
 * @param windowMs Window duration in milliseconds
 * @returns        { ok: true } if allowed, { ok: false, retryAfter: number } if limited
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfter: number } {
  maybePrune();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { ok: true };
}

/**
 * Get the client IP from a Next.js request, falling back gracefully.
 */
export function getClientIP(req: Request): string {
  const headers = req instanceof Request ? req.headers : (req as any).headers;
  return (
    headers.get?.('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get?.('x-real-ip') ??
    'unknown'
  );
}
    headers.get?.('x-real-ip') ??
    'unknown'
  );
}
