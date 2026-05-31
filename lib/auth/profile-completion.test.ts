import { describe, it, expect } from 'vitest';
import { computeProfileCompletion } from './profile-completion';

// Pins the contract on /api/profile GET's recalc step. The ring on
// /profile + the % readout on /dashboard render this value, so a
// regression here goes straight into the UX.

const PAST = '2026-01-01T00:00:00Z';

describe('computeProfileCompletion', () => {
  it('returns 0 for a brand-new signup with nothing filled in', () => {
    expect(computeProfileCompletion({
      name: 'john', email: 'john@example.com',
      emailConfirmedAt: null, cvUrl: null,
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(0);
  });

  it('treats name == email local-part as "not set yet"', () => {
    // /api/profile assigns the email-prefix as the fallback name when
    // raw_user_meta_data.name is missing. Real "name set" = something
    // different than that fallback.
    expect(computeProfileCompletion({
      name: 'john', email: 'JOHN@example.com',
      emailConfirmedAt: PAST, cvUrl: null,
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(20); // only the email-confirmed +20
  });

  it('treats a real name as filled in', () => {
    expect(computeProfileCompletion({
      name: 'John Doe', email: 'john@example.com',
      emailConfirmedAt: null, cvUrl: null,
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(20); // name +20
  });

  it('credits each signal separately', () => {
    expect(computeProfileCompletion({
      name: 'John Doe', email: 'john@example.com',
      emailConfirmedAt: null, cvUrl: null,
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(20); // +20 name
    expect(computeProfileCompletion({
      name: null, email: 'john@example.com',
      emailConfirmedAt: PAST, cvUrl: null,
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(20); // +20 confirmed
    expect(computeProfileCompletion({
      name: null, email: 'john@example.com',
      emailConfirmedAt: null, cvUrl: 'user-id/cv.pdf',
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(30); // +30 cv
    expect(computeProfileCompletion({
      name: null, email: 'john@example.com',
      emailConfirmedAt: null, cvUrl: null,
      applicationsCount: 3, savedJobsCount: 0,
    })).toBe(15); // +15 ≥1 app
    expect(computeProfileCompletion({
      name: null, email: 'john@example.com',
      emailConfirmedAt: null, cvUrl: null,
      applicationsCount: 0, savedJobsCount: 1,
    })).toBe(15); // +15 ≥1 save
  });

  it('caps at 100 when every signal is set', () => {
    expect(computeProfileCompletion({
      name: 'John Doe', email: 'john@example.com',
      emailConfirmedAt: PAST, cvUrl: 'user-id/cv.pdf',
      applicationsCount: 7, savedJobsCount: 4,
    })).toBe(100); // 20 + 20 + 30 + 15 + 15
  });

  it('treats whitespace-only fields as not set', () => {
    expect(computeProfileCompletion({
      name: '   ', email: 'john@example.com',
      emailConfirmedAt: PAST, cvUrl: '   ',
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(20); // only email-confirmed
  });

  it('ignores null email when computing the name fallback', () => {
    // If email is somehow missing, any non-empty name counts.
    expect(computeProfileCompletion({
      name: 'John', email: null,
      emailConfirmedAt: null, cvUrl: null,
      applicationsCount: 0, savedJobsCount: 0,
    })).toBe(20);
  });

  it('treats applicationsCount and savedJobsCount as ≥1 thresholds, not weighted', () => {
    // Whether the user has 1 application or 100, the credit is the
    // same +15. Same for saved.
    const base = {
      name: null, email: 'x@y.com', emailConfirmedAt: null,
      cvUrl: null, savedJobsCount: 0,
    };
    expect(computeProfileCompletion({ ...base, applicationsCount: 1 })).toBe(15);
    expect(computeProfileCompletion({ ...base, applicationsCount: 100 })).toBe(15);
  });
});
