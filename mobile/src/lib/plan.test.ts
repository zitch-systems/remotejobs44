import { canChooseBillingSelection, resolveMobilePlan } from './plan';

describe('resolveMobilePlan', () => {
  it('honours admins and manual null-expiry grants', () => {
    expect(resolveMobilePlan({ role: 'admin', dbPlan: 'free', planExpiresAt: null })).toBe('admin');
    expect(resolveMobilePlan({ role: 'user', dbPlan: 'pro', planExpiresAt: null })).toBe('pro');
  });

  it('fails closed for suspended, expired, malformed and forged values', () => {
    expect(resolveMobilePlan({ role: 'admin', dbPlan: 'pro', planExpiresAt: null, suspended: true })).toBe('free');
    expect(resolveMobilePlan({ role: 'user', dbPlan: 'pro', planExpiresAt: 'not-a-date' })).toBe('free');
    expect(resolveMobilePlan({ role: 'user', dbPlan: 'admin', planExpiresAt: null })).toBe('free');
    expect(resolveMobilePlan({ role: 'user', dbPlan: 'pro', planExpiresAt: '2020-01-01' })).toBe('free');
  });
});

describe('canChooseBillingSelection', () => {
  it('offers only strict upgrades', () => {
    expect(canChooseBillingSelection('daily', 'daily', 'pro')).toBe(true);
    expect(canChooseBillingSelection('pro', 'monthly', 'annual')).toBe(true);
    expect(canChooseBillingSelection('pro', 'monthly', 'daily')).toBe(false);
    expect(canChooseBillingSelection('pro', 'annually', 'pro')).toBe(false);
    expect(canChooseBillingSelection('pro', 'annually', 'annual')).toBe(false);
    expect(canChooseBillingSelection('admin', null, 'annual')).toBe(false);
  });
});
