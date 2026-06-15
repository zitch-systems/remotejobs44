import { applicationLimit, applicationsLeft, canApply, canUseAI, FREE_DAILY_APPLICATIONS, isPaid } from './entitlements';

describe('entitlements', () => {
  it('isPaid / canUseAI gate paid plans', () => {
    expect(isPaid('free')).toBe(false);
    expect(isPaid('pro')).toBe(true);
    expect(isPaid('daily')).toBe(true);
    expect(isPaid('admin')).toBe(true);
    expect(canUseAI('free')).toBe(false);
    expect(canUseAI('pro')).toBe(true);
  });
  it('application limit is finite for free, infinite for paid', () => {
    expect(applicationLimit('free')).toBe(FREE_DAILY_APPLICATIONS);
    expect(applicationLimit('pro')).toBe(Infinity);
  });
  it('canApply respects the free daily cap', () => {
    expect(canApply('free', 0)).toBe(true);
    expect(canApply('free', FREE_DAILY_APPLICATIONS - 1)).toBe(true);
    expect(canApply('free', FREE_DAILY_APPLICATIONS)).toBe(false);
    expect(canApply('pro', 9999)).toBe(true);
  });
  it('applicationsLeft counts down for free, stays infinite for paid', () => {
    expect(applicationsLeft('free', 3)).toBe(FREE_DAILY_APPLICATIONS - 3);
    expect(applicationsLeft('free', 999)).toBe(0);
    expect(applicationsLeft('pro', 9999)).toBe(Infinity);
  });
});
