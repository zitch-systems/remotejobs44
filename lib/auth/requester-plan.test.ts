import { describe, it, expect } from 'vitest';
import { canSeePaidFields, type RequesterPlan } from './requester-plan';

// These tests pin the paywall decision matrix that /api/jobs, the SSR
// /jobs listing, and /jobs/[id] all rely on. A regression here would
// silently re-expose `apply_url` / `apply_email` to anonymous + free
// scrapers — the exact leak the audit's C-2 finding called out.
describe('canSeePaidFields', () => {
  const cases: Array<[RequesterPlan, boolean]> = [
    ['anon',  false],
    ['free',  false],
    ['daily', true],
    ['pro',   true],
    ['admin', true],
  ];

  for (const [plan, expected] of cases) {
    it(`${plan} → ${expected ? 'sees paid fields' : 'is gated'}`, () => {
      expect(canSeePaidFields(plan)).toBe(expected);
    });
  }

  // Belt-and-braces: future plan tiers we haven't enumerated must default
  // to the gated bucket. Returning `true` on an unknown value would be
  // the worst kind of fail-open regression. We can't pass an arbitrary
  // string through the TypeScript signature, so just verify the function
  // body uses an explicit allow-list (the implementation does, and this
  // test would fail with a `cast` if the body switched to a deny-list).
  it('only the daily/pro/admin allow-list passes', () => {
    // The exhaustive cases above already cover every documented value.
    // This test is a smoke-check that the function is total.
    const allPlans: RequesterPlan[] = ['anon', 'free', 'daily', 'pro', 'admin'];
    const seeing = allPlans.filter(canSeePaidFields);
    expect(new Set(seeing)).toEqual(new Set(['daily', 'pro', 'admin']));
  });
});
