import { applicationsLeft, canApply, canUseAI, isPaid, FREE_TRIAL_APPLICATIONS } from './entitlements';

const REGISTERED = '2026-06-01T00:00:00Z';
const DAY1 = new Date(REGISTERED).getTime() + 24 * 60 * 60 * 1000;

describe('entitlements', () => {
  it('isPaid / canUseAI gate paid plans', () => {
    expect(isPaid('free')).toBe(false);
    expect(isPaid('pro')).toBe(true);
    expect(isPaid('daily')).toBe(true);
    expect(isPaid('admin')).toBe(true);
    expect(canUseAI('free')).toBe(false);
    expect(canUseAI('pro')).toBe(true);
  });

  it('paid plans apply without limit', () => {
    const trial = { registeredAt: REGISTERED, used: 9999, now: DAY1 };
    expect(canApply('pro', trial)).toBe(true);
    expect(applicationsLeft('pro', trial)).toBe(Infinity);
  });

  it('free users get FREE_TRIAL_APPLICATIONS within the window', () => {
    expect(canApply('free', { registeredAt: REGISTERED, used: 0, now: DAY1 })).toBe(true);
    expect(canApply('free', { registeredAt: REGISTERED, used: FREE_TRIAL_APPLICATIONS - 1, now: DAY1 })).toBe(true);
    expect(canApply('free', { registeredAt: REGISTERED, used: FREE_TRIAL_APPLICATIONS, now: DAY1 })).toBe(false);
  });

  it('applicationsLeft counts down for free', () => {
    expect(applicationsLeft('free', { registeredAt: REGISTERED, used: 1, now: DAY1 })).toBe(FREE_TRIAL_APPLICATIONS - 1);
    expect(applicationsLeft('free', { registeredAt: REGISTERED, used: 999, now: DAY1 })).toBe(0);
  });
});
