import { describe, expect, it } from 'vitest';
import { isSafeClosedJobMeta } from './closed-job';

describe('isSafeClosedJobMeta', () => {
  it('rejects flagged jobs from the public closed-position view', () => {
    expect(isSafeClosedJobMeta({ flagged: true })).toBe(false);
  });

  it('allows unflagged and legacy-null jobs', () => {
    expect(isSafeClosedJobMeta({ flagged: false })).toBe(true);
    expect(isSafeClosedJobMeta({ flagged: null })).toBe(true);
  });
});
