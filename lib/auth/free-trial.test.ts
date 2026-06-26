import { describe, it, expect } from 'vitest';
import {
  evaluateFreeTrial,
  freeTrialEndsAt,
  freeTrialBlockedMessage,
  FREE_TRIAL_APPLICATIONS,
  FREE_TRIAL_DAYS,
} from './free-trial';

// Pins the contract shared by the /api/applications gate and the
// JobCard / JobActionsCard "Apply" buttons. A regression here either
// leaks free applies past the cap or wrongly walls off a user mid-trial.

const REGISTERED = '2026-06-01T00:00:00Z';
const startMs = new Date(REGISTERED).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
// 1 day into the window.
const DAY1 = startMs + DAY_MS;
// Just past the window close.
const PAST_WINDOW = startMs + (FREE_TRIAL_DAYS * DAY_MS) + 1000;

describe('freeTrialEndsAt', () => {
  it('adds the trial window to the registration date', () => {
    expect(freeTrialEndsAt(REGISTERED)).toBe(startMs + FREE_TRIAL_DAYS * DAY_MS);
  });

  it('returns null when the registration date is missing or unparseable', () => {
    expect(freeTrialEndsAt(null)).toBeNull();
    expect(freeTrialEndsAt(undefined)).toBeNull();
    expect(freeTrialEndsAt('not-a-date')).toBeNull();
  });
});

describe('evaluateFreeTrial', () => {
  it('allows a fresh registered user with no applications', () => {
    const s = evaluateFreeTrial({ registeredAt: REGISTERED, used: 0, now: DAY1 });
    expect(s.canApply).toBe(true);
    expect(s.remaining).toBe(FREE_TRIAL_APPLICATIONS);
    expect(s.windowExpired).toBe(false);
    expect(s.limitReached).toBe(false);
  });

  it('counts down remaining applications within the window', () => {
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: 1, now: DAY1 }).remaining).toBe(2);
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: 2, now: DAY1 }).remaining).toBe(1);
  });

  it('blocks once the application limit is reached (window still open)', () => {
    const s = evaluateFreeTrial({ registeredAt: REGISTERED, used: FREE_TRIAL_APPLICATIONS, now: DAY1 });
    expect(s.canApply).toBe(false);
    expect(s.remaining).toBe(0);
    expect(s.limitReached).toBe(true);
    expect(s.windowExpired).toBe(false);
  });

  it('blocks once the window has elapsed, even with applies left', () => {
    const s = evaluateFreeTrial({ registeredAt: REGISTERED, used: 0, now: PAST_WINDOW });
    expect(s.canApply).toBe(false);
    expect(s.windowExpired).toBe(true);
    // remaining is still reported honestly, but canApply is false.
    expect(s.remaining).toBe(FREE_TRIAL_APPLICATIONS);
  });

  it('treats over-count and negative used defensively (never negative remaining)', () => {
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: 99, now: DAY1 }).remaining).toBe(0);
    expect(evaluateFreeTrial({ registeredAt: REGISTERED, used: -5, now: DAY1 }).remaining).toBe(FREE_TRIAL_APPLICATIONS);
  });

  it('when registration date is unknown, gates on the limit only', () => {
    const within = evaluateFreeTrial({ registeredAt: null, used: 1, now: DAY1 });
    expect(within.windowExpired).toBe(false);
    expect(within.canApply).toBe(true);
    const over = evaluateFreeTrial({ registeredAt: null, used: FREE_TRIAL_APPLICATIONS, now: DAY1 });
    expect(over.canApply).toBe(false);
    expect(over.limitReached).toBe(true);
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
