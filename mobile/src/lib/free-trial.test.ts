import { evaluateFreeTrial, freeTrialEndsAt, freeTrialBlockedMessage, FREE_TRIAL_APPLICATIONS, FREE_TRIAL_DAYS } from './free-trial';

// Mirrors the web contract (lib/auth/free-trial.test.ts) so phone and web
// gate identically: 3 applications within a 7-day window from registration.

const REGISTERED = '2026-06-01T00:00:00Z';
const startMs = new Date(REGISTERED).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY1 = startMs + DAY_MS;
const PAST_WINDOW = startMs + FREE_TRIAL_DAYS * DAY_MS + 1000;

describe('freeTrialEndsAt', () => {
  it('adds the window to the registration date', () => {
    expect(freeTrialEndsAt(REGISTERED)).toBe(startMs + FREE_TRIAL_DAYS * DAY_MS);
  });
  it('returns null for missing / unparseable dates', () => {
    expect(freeTrialEndsAt(null)).toBeNull();
    expect(freeTrialEndsAt(undefined)).toBeNull();
    expect(freeTrialEndsAt('nope')).toBeNull();
  });
});

describe('evaluateFreeTrial', () => {
  it('allows a fresh registered user', () => {
    const s = evaluateFreeTrial({ registeredAt: REGISTERED, used: 0, now: DAY1 });
    expect(s.canApply).toBe(true);
    expect(s.remaining).toBe(FREE_TRIAL_APPLICATIONS);
  });
  it('counts down remaining', () => {
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: 1, now: DAY1 }).remaining).toBe(2);
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: 2, now: DAY1 }).remaining).toBe(1);
  });
  it('blocks at the limit', () => {
    const s = evaluateFreeTrial({ registeredAt: REGISTERED, used: FREE_TRIAL_APPLICATIONS, now: DAY1 });
    expect(s.canApply).toBe(false);
    expect(s.limitReached).toBe(true);
    expect(s.windowExpired).toBe(false);
  });
  it('blocks once the window elapses, even with applies left', () => {
    const s = evaluateFreeTrial({ registeredAt: REGISTERED, used: 0, now: PAST_WINDOW });
    expect(s.canApply).toBe(false);
    expect(s.windowExpired).toBe(true);
  });
  it('is defensive about over-count and negative used', () => {
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: 99, now: DAY1 }).remaining).toBe(0);
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: -5, now: DAY1 }).remaining).toBe(FREE_TRIAL_APPLICATIONS);
  });
  it('with unknown registration date, gates on the limit only', () => {
    expect(evaluateFreeTrial({ registeredAt: null, used: 1, now: DAY1 }).canApply).toBe(true);
    expect(evaluateFreeTrial({ registeredAt: null, used: FREE_TRIAL_APPLICATIONS, now: DAY1 }).canApply).toBe(false);
  });
});

describe('freeTrialBlockedMessage', () => {
  it('explains an elapsed window', () => {
    expect(freeTrialBlockedMessage({ windowExpired: true })).toContain('free trial has ended');
  });
  it('explains an exhausted allowance', () => {
    expect(freeTrialBlockedMessage({ windowExpired: false })).toContain('free applications');
  });
});
