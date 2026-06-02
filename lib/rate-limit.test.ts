import { describe, it, expect } from 'vitest';
import { rateLimit, releaseRateLimit } from './rate-limit';

// Each test uses a unique key so the module-scope store doesn't leak
// state between cases.
const k = (name: string) => `test:${name}:${Math.random()}`;

describe('rateLimit', () => {
  it('allows up to the limit then blocks further requests', () => {
    const key = k('allow');
    expect(rateLimit(key, 2, 60_000).success).toBe(true);
    expect(rateLimit(key, 2, 60_000).success).toBe(true);
    const blocked = rateLimit(key, 2, 60_000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('reports the remaining budget', () => {
    const key = k('remaining');
    expect(rateLimit(key, 3, 60_000).remaining).toBe(2);
    expect(rateLimit(key, 3, 60_000).remaining).toBe(1);
    expect(rateLimit(key, 3, 60_000).remaining).toBe(0);
  });
});

describe('releaseRateLimit', () => {
  it('refunds a consumed token so one more request succeeds', () => {
    const key = k('refund');
    rateLimit(key, 1, 60_000);                              // consume the only token
    expect(rateLimit(key, 1, 60_000).success).toBe(false); // now blocked
    releaseRateLimit(key);                                  // refund it
    expect(rateLimit(key, 1, 60_000).success).toBe(true);  // allowed again
  });

  it('never drops the count below zero', () => {
    const key = k('floor');
    rateLimit(key, 5, 60_000);   // count = 1
    releaseRateLimit(key);       // count = 0
    releaseRateLimit(key);       // stays 0
    releaseRateLimit(key);       // stays 0
    // A full budget of 5 should still be available.
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).success).toBe(true);
    }
    expect(rateLimit(key, 5, 60_000).success).toBe(false);
  });

  it('is a no-op for an unknown key', () => {
    expect(() => releaseRateLimit(k('unknown'))).not.toThrow();
  });
});
