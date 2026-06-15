import {
  bulletsFrom,
  deriveMatch,
  dbToStatus,
  gradFor,
  money,
  personalizeJobs,
  referralLink,
  rewardProgress,
  salaryLabel,
  tagsFrom,
  timeAgo,
} from './format';
import type { Job } from './types';

describe('money', () => {
  it('formats thousands and millions', () => {
    expect(money(160000, 'USD')).toBe('$160k');
    expect(money(18_000_000, 'NGN')).toBe('₦18m');
    expect(money(2_500_000, 'USD')).toBe('$2.5m');
    expect(money(500, 'USD')).toBe('$500');
  });
  it('falls back to a currency-code prefix for unknown currencies', () => {
    expect(money(1000, 'AUD')).toBe('AUD 1k');
  });
});

describe('salaryLabel', () => {
  it('prefers max, then min, else Competitive', () => {
    expect(salaryLabel(100000, 160000, 'USD')).toBe('$160k');
    expect(salaryLabel(90000, null, 'USD')).toBe('$90k');
    expect(salaryLabel(null, null, 'USD')).toBe('Competitive');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-06-15T00:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('buckets durations', () => {
    expect(timeAgo(ago(30 * 60_000), now)).toBe('just now');
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3h ago');
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe('2d ago');
    expect(timeAgo(ago(14 * 86_400_000), now)).toBe('2w ago');
    expect(timeAgo(null, now)).toBe('recently');
  });
});

describe('deriveMatch', () => {
  const now = Date.parse('2026-06-15T00:00:00Z');
  it('is deterministic and bounded to 70..98', () => {
    const r = { id: 'abc', skills: ['a', 'b', 'c'], salary_min: 100, salary_max: 200, posted_at: new Date(now).toISOString(), featured: true };
    expect(deriveMatch(r, now)).toBe(deriveMatch(r, now));
    expect(deriveMatch(r, now)).toBeGreaterThanOrEqual(70);
    expect(deriveMatch(r, now)).toBeLessThanOrEqual(98);
  });
  it('ranks a rich, recent, featured job above a sparse, old one', () => {
    const rich = { id: 'x', skills: ['a', 'b', 'c', 'd', 'e', 'f'], salary_min: 1, salary_max: 2, posted_at: new Date(now).toISOString(), featured: true };
    const sparse = { id: 'x', skills: null, salary_min: null, salary_max: null, posted_at: new Date(now - 200 * 86_400_000).toISOString(), featured: false };
    expect(deriveMatch(rich, now)).toBeGreaterThan(deriveMatch(sparse, now));
  });
});

describe('personalizeJobs', () => {
  const job = (skills: string[], match: number) => ({ skills, match } as unknown as Job);
  it('boosts skill overlap and caps at 99', () => {
    expect(personalizeJobs([job(['React', 'TypeScript'], 80)], ['react'])[0].match).toBe(83);
    expect(personalizeJobs([job(['a', 'b', 'c'], 98)], ['a', 'b', 'c'])[0].match).toBe(99);
  });
  it('is a no-op when the user has no skills', () => {
    const input = [job(['React'], 80)];
    expect(personalizeJobs(input, [])).toBe(input);
  });
});

describe('dbToStatus', () => {
  it('passes through valid application statuses', () => {
    expect(dbToStatus('screening')).toBe('screening');
    expect(dbToStatus('interview')).toBe('interview');
    expect(dbToStatus('offer')).toBe('offer');
    expect(dbToStatus('applied')).toBe('applied');
    expect(dbToStatus('rejected')).toBe('rejected');
    expect(dbToStatus('withdrawn')).toBe('withdrawn');
  });
  it('falls back to applied for unknown values', () => {
    expect(dbToStatus('weird')).toBe('applied');
    expect(dbToStatus('')).toBe('applied');
  });
});

describe('referralLink', () => {
  it('builds the /r/ invite URL and encodes the code', () => {
    expect(referralLink('RJ44ABCD')).toBe('https://remotejobs44.com/r/RJ44ABCD');
    expect(referralLink('a b')).toBe('https://remotejobs44.com/r/a%20b');
  });
});

describe('rewardProgress', () => {
  it('reports remaining, percentage, and whether the goal is reached', () => {
    expect(rewardProgress(0, 3)).toEqual({ remaining: 3, pct: 0, reached: false });
    expect(rewardProgress(2, 3)).toEqual({ remaining: 1, pct: 67, reached: false });
    expect(rewardProgress(3, 3)).toEqual({ remaining: 0, pct: 100, reached: true });
  });
  it('clamps overshoot and guards bad input', () => {
    expect(rewardProgress(5, 3)).toEqual({ remaining: 0, pct: 100, reached: true });
    expect(rewardProgress(-2, 0)).toEqual({ remaining: 1, pct: 0, reached: false });
  });
});

describe('tagsFrom / gradFor / bulletsFrom', () => {
  it('marks the first tag blue, caps at 3', () => {
    const tags = tagsFrom(['a', 'b', 'c', 'd'], null);
    expect(tags).toHaveLength(3);
    expect(tags[0].variant).toBe('blue');
    expect(tags[1].variant).toBe('default');
  });
  it('gradFor is a deterministic colour pair', () => {
    expect(gradFor('Vercel')).toEqual(gradFor('Vercel'));
    expect(gradFor('Vercel')).toHaveLength(2);
  });
  it('bulletsFrom splits text and falls back when empty', () => {
    expect(bulletsFrom(null, null)).toHaveLength(1);
    expect(bulletsFrom('Own the roadmap.\nShip reliable services.', null).length).toBeGreaterThanOrEqual(2);
  });
  it('bulletsFrom uses a string[] (live requirements) directly', () => {
    expect(bulletsFrom(['Build APIs', 'Ship features', '  '], null)).toEqual(['Build APIs', 'Ship features']);
    expect(bulletsFrom([], 'Fallback to description here.')).toHaveLength(1);
  });
});
