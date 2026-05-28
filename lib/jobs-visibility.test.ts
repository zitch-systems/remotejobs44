import { describe, it, expect } from 'vitest';
import { notExpired, NOT_FLAGGED } from './jobs-visibility';

describe('notExpired', () => {
  it('builds a PostgREST .or() string with current ISO timestamp', () => {
    const before = Date.now();
    const result = notExpired();
    const after  = Date.now();

    expect(result).toMatch(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-\d{2}-\d{2}T/);

    const tsMatch = result.match(/gt\.(.+)$/);
    expect(tsMatch).toBeTruthy();
    const ts = new Date(tsMatch![1]).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('returns fresh timestamp each call (not cached)', () => {
    const a = notExpired();
    // Force a 5ms gap so ISO strings differ
    return new Promise<void>(resolve => setTimeout(() => {
      const b = notExpired();
      expect(a).not.toBe(b);
      resolve();
    }, 5));
  });
});

describe('NOT_FLAGGED', () => {
  it('is a stable PostgREST .or() string', () => {
    expect(NOT_FLAGGED).toBe('flagged.eq.false,flagged.is.null');
  });
});
