import { describe, it, expect } from 'vitest';
import { resolvePlan } from './plan';

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('resolvePlan', () => {
  it('returns admin regardless of dbPlan / expiry when role is admin', () => {
    expect(resolvePlan({ role: 'admin', dbPlan: 'free',  planExpiresAt: null  })).toBe('admin');
    expect(resolvePlan({ role: 'admin', dbPlan: 'pro',   planExpiresAt: PAST  })).toBe('admin');
    expect(resolvePlan({ role: 'admin', dbPlan: 'daily', planExpiresAt: null  })).toBe('admin');
  });

  // Agents get REGISTERED-user access by virtue of their role — never
  // subscribed access. The 'agent' role must resolve plan exactly like 'user':
  // free until they actually pay, and only their paid tier while a live
  // plan_expires_at holds. Only 'admin' is ever elevated by role. This pins
  // that being an agent is NOT a free pass to subscribed features — they must
  // subscribe like anyone else.
  it('agent role never elevates the plan — resolves like a normal user', () => {
    expect(resolvePlan({ role: 'agent', dbPlan: 'free',  planExpiresAt: null   })).toBe('free');
    expect(resolvePlan({ role: 'agent', dbPlan: null,    planExpiresAt: null   })).toBe('free');
    expect(resolvePlan({ role: 'agent', dbPlan: 'pro',   planExpiresAt: PAST   })).toBe('free');   // lapsed → free
    expect(resolvePlan({ role: 'agent', dbPlan: 'pro',   planExpiresAt: FUTURE })).toBe('pro');    // paid → pro
    expect(resolvePlan({ role: 'agent', dbPlan: 'daily', planExpiresAt: FUTURE })).toBe('daily');  // paid → daily
  });

  it('returns free when expiry is in the past', () => {
    expect(resolvePlan({ role: 'user', dbPlan: 'pro',   planExpiresAt: PAST })).toBe('free');
    expect(resolvePlan({ role: 'user', dbPlan: 'daily', planExpiresAt: PAST })).toBe('free');
  });

  it('returns dbPlan when expiry is in the future and dbPlan is paid', () => {
    expect(resolvePlan({ role: 'user', dbPlan: 'pro',   planExpiresAt: FUTURE })).toBe('pro');
    expect(resolvePlan({ role: 'user', dbPlan: 'daily', planExpiresAt: FUTURE })).toBe('daily');
  });

  it('returns free when no plan info at all', () => {
    expect(resolvePlan({ role: 'user', dbPlan: null,        planExpiresAt: null })).toBe('free');
    expect(resolvePlan({ role: 'user', dbPlan: undefined,   planExpiresAt: null })).toBe('free');
    expect(resolvePlan({ role: 'user', dbPlan: 'unknown',   planExpiresAt: null })).toBe('free');
  });

  it('webhook race: keeps higher persisted plan when DB says free but expiry proves payment', () => {
    // The whole motivation for the helper — verify route stamped a future
    // plan_expires_at but profile.plan is still 'free' for a few seconds.
    expect(resolvePlan({
      role: 'user', dbPlan: 'free', planExpiresAt: FUTURE,
      currentClientPlan: 'pro',
    })).toBe('pro');

    expect(resolvePlan({
      role: 'user', dbPlan: 'free', planExpiresAt: FUTURE,
      currentClientPlan: 'daily',
    })).toBe('daily');
  });

  it('does NOT keep client plan when expiry is in the past (real expiry)', () => {
    expect(resolvePlan({
      role: 'user', dbPlan: 'free', planExpiresAt: PAST,
      currentClientPlan: 'pro',
    })).toBe('free');
  });

  it('does NOT keep client plan when client plan is also free', () => {
    expect(resolvePlan({
      role: 'user', dbPlan: 'free', planExpiresAt: FUTURE,
      currentClientPlan: 'free',
    })).toBe('free');
  });

  it('does NOT keep client plan when DB has a real paid plan', () => {
    expect(resolvePlan({
      role: 'user', dbPlan: 'pro', planExpiresAt: FUTURE,
      currentClientPlan: 'daily',
    })).toBe('pro');
  });

  // Pins the runtime-validation guard added on the webhook-race branch.
  // currentClientPlan flows from persisted localStorage, which a user can
  // freely edit in devtools. Without the guard the function would cast
  // any string-typed plan through to the response and downstream
  // `plan === 'pro'` checks would silently miss the truth.
  it('does NOT honour a non-Plan currentClientPlan even with a future expiry', () => {
    expect(resolvePlan({
      role: 'user', dbPlan: 'free', planExpiresAt: FUTURE,
      currentClientPlan: 'lifetime_pro',
    })).toBe('free');

    expect(resolvePlan({
      role: 'user', dbPlan: 'free', planExpiresAt: FUTURE,
      currentClientPlan: 'PRO',
    })).toBe('free');

    expect(resolvePlan({
      role: 'user', dbPlan: 'free', planExpiresAt: FUTURE,
      currentClientPlan: 'admin',
    })).toBe('admin'); // 'admin' IS a Plan member, so this one IS honoured
  });
});
