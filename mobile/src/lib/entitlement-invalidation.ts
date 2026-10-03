import { clearFeedCache } from './feed-cache';

const listeners = new Set<() => void>();

export function subscribeEntitlementInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Refresh every mounted entitlement consumer after a verified server change. */
export function invalidateEntitlements(): void {
  void clearFeedCache();
  listeners.forEach((listener) => listener());
}
