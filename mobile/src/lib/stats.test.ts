import { applicationStats, inStatusFilter } from './stats';
import type { AppStatus } from './types';

const applied: Record<string, AppStatus> = {
  a: 'applied',
  b: 'screening',
  c: 'interview',
  d: 'offer',
  e: 'rejected',
  f: 'withdrawn',
};

describe('applicationStats', () => {
  it('buckets statuses and computes response rate', () => {
    const s = applicationStats(applied);
    expect(s.total).toBe(6);
    expect(s.active).toBe(2); // applied + screening
    expect(s.interviewing).toBe(2); // interview + offer
    expect(s.offers).toBe(1);
    expect(s.closed).toBe(2); // rejected + withdrawn
    expect(s.responseRate).toBe(50); // screening+interview+offer = 3 of 6
  });
  it('is zero-safe when empty', () => {
    expect(applicationStats({})).toEqual({ total: 0, active: 0, interviewing: 0, offers: 0, closed: 0, responseRate: 0 });
  });
});

describe('inStatusFilter', () => {
  it('groups statuses into filters', () => {
    expect(inStatusFilter('applied', 'all')).toBe(true);
    expect(inStatusFilter('applied', 'active')).toBe(true);
    expect(inStatusFilter('interview', 'active')).toBe(false);
    expect(inStatusFilter('offer', 'interviewing')).toBe(true);
    expect(inStatusFilter('offer', 'offers')).toBe(true);
    expect(inStatusFilter('interview', 'offers')).toBe(false);
    expect(inStatusFilter('withdrawn', 'closed')).toBe(true);
    expect(inStatusFilter('applied', 'closed')).toBe(false);
  });
});
