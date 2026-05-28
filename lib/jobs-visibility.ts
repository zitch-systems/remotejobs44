// lib/jobs-visibility.ts
// PostgREST .or() filter strings for the two "is this job safe to show
// the public" gates. Duplicated as string constants across 8+ landing
// pages and /api/jobs before — collapsing to one place so they don't
// drift.
//
// Usage:
//   query
//     .eq('is_active', true)
//     .or(notExpired())
//     .or(NOT_FLAGGED)
//
// Both filters are written so jobs whose column is NULL (legacy rows
// inserted before migrations v11/v12) still pass — column defaults are
// safe (flagged=false, expires_at=null).

export function notExpired(): string {
  return `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;
}

export const NOT_FLAGGED = 'flagged.eq.false,flagged.is.null';
