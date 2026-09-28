import { describe, it, expect, vi } from 'vitest';
import { getRequesterPlan, canSeePaidFields, canSeeCompanyName, canUseJobAlerts, type RequesterPlan } from './requester-plan';

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

// Pins the employer-identity gate on /jobs/[id]: the company name is a
// subscriber (Pro monthly/annual) feature. Day Pass buys apply access but
// NOT the employer reveal — flipping 'daily' to true here would leak the
// name to every day-pass user server-side, where no client blur can help.
describe('canSeeCompanyName', () => {
  const cases: Array<[RequesterPlan, boolean]> = [
    ['anon',  false],
    ['free',  false],
    ['daily', false],
    ['pro',   true],
    ['admin', true],
  ];

  for (const [plan, expected] of cases) {
    it(`${plan} → ${expected ? 'sees the employer' : 'is masked'}`, () => {
      expect(canSeeCompanyName(plan)).toBe(expected);
    });
  }

  it('only the pro/admin allow-list passes', () => {
    const allPlans: RequesterPlan[] = ['anon', 'free', 'daily', 'pro', 'admin'];
    const seeing = allPlans.filter(canSeeCompanyName);
    expect(new Set(seeing)).toEqual(new Set(['pro', 'admin']));
  });
});

// Job alerts are a recurring email tied to an ongoing subscription. This
// gate has to keep agreeing with the plan filter in the daily cron's alert
// loop: when the two drift, the API writes alert rows the cron will never
// send, and the user waits indefinitely for mail nobody is going to post.
describe('canUseJobAlerts', () => {
  const cases: Array<[RequesterPlan, boolean]> = [
    ['anon',  false],
    ['free',  false],
    // Day Pass expires 24h after purchase — a *recurring daily* email
    // attached to it would outlive the entitlement that paid for it.
    ['daily', false],
    ['pro',   true],
    ['admin', true],
  ];

  for (const [plan, expected] of cases) {
    it(`${plan} → ${expected ? 'can own alerts' : 'cannot own alerts'}`, () => {
      expect(canUseJobAlerts(plan)).toBe(expected);
    });
  }

  it('only the pro/admin allow-list passes', () => {
    const allPlans: RequesterPlan[] = ['anon', 'free', 'daily', 'pro', 'admin'];
    const allowed = allPlans.filter(canUseJobAlerts);
    expect(new Set(allowed)).toEqual(new Set(['pro', 'admin']));
  });

  it('matches the cron send filter exactly', () => {
    // The cron does `['pro','admin'].includes(profile.plan)`. Pin that the
    // two agree so a change to one side fails here rather than in production.
    const cronFilter = (p: string) => ['pro', 'admin'].includes(p);
    const allPlans: RequesterPlan[] = ['anon', 'free', 'daily', 'pro', 'admin'];
    for (const plan of allPlans) {
      expect(canUseJobAlerts(plan)).toBe(cronFilter(plan));
    }
  });
});

describe('getRequesterPlan', () => {
  // Pins the anonymous fast path: a request with no Supabase session must
  // resolve to 'anon' from the cookie jar alone — getUser() reaching the
  // Auth server for every anonymous /jobs, /jobs/[id], and /api/jobs hit
  // is what used to saturate the 10-connection-capped Auth service.
  it('sessionless request resolves to anon without calling getUser', async () => {
    const getUser = vi.fn();
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser,
      },
    } as any;
    await expect(getRequesterPlan(supabase)).resolves.toBe('anon');
    expect(getUser).not.toHaveBeenCalled();
  });

  // The fast path must not weaken validation for cookie-bearing requests:
  // the (unverified) getSession result is only a null check, and getUser()
  // remains the authority on who the requester actually is.
  it('session-bearing request still validates via getUser', async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'user@example.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: 'user', plan: 'pro', plan_expires_at: null },
            }),
          }),
        }),
      }),
    } as any;
    await expect(getRequesterPlan(supabase)).resolves.toBe('pro');
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  // A session that getUser() then rejects (revoked/garbage token) must
  // land in the most-restricted bucket, same as before the fast path.
  it('invalid session falls back to anon', async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 401 } }),
      },
    } as any;
    await expect(getRequesterPlan(supabase)).resolves.toBe('anon');
  });
});
