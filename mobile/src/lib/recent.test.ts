import {
  MASKED_RECENT_COMPANY,
  MASKED_RECENT_GRADIENT,
  mergeRecentState,
  migrateRecentState,
  pushRecent,
  RECENT_CAP,
  toRecent,
  type RecentJob,
} from './recent';
import type { Job } from './types';

const rj = (id: string): RecentJob => ({
  id,
  role: `Role ${id}`,
  company: `Co ${id}`,
  logo: 'C',
  grad: ['#000', '#111'],
  salary: '$1k',
  per: '/yr',
  verified: true,
});

describe('toRecent', () => {
  it('extracts the compact snapshot from a Job', () => {
    const job = { id: 'a', role: 'Backend', company: 'Acme', logo: 'A', grad: ['#000', '#fff'], logoUrl: 'http://x/y.png', salary: '$100k', per: '/yr', verified: true } as Job;
    expect(toRecent(job)).toEqual({
      id: 'a',
      role: 'Backend',
      company: 'Acme',
      logo: 'A',
      grad: ['#000', '#fff'],
      logoUrl: 'http://x/y.png',
      salary: '$100k',
      per: '/yr',
      verified: true,
    });
  });

  it('masks every employer identity field in a configured-app snapshot', () => {
    const job = {
      id: 'a', role: 'Backend Engineer at Acme (Acme platform)', company: 'Acme Inc.',
      logo: 'A', grad: ['#000', '#fff'], logoUrl: 'https://acme.test/logo.png',
      salary: '$100k', per: '/yr', verified: true,
    } as Job;

    expect(toRecent(job, true)).toEqual({
      id: 'a',
      role: 'Backend Engineer at Hidden Company (Hidden Company platform)',
      company: MASKED_RECENT_COMPANY,
      logo: '?',
      grad: MASKED_RECENT_GRADIENT,
      salary: '$100k',
      per: '/yr',
      verified: true,
    });
  });
});

describe('recent history migration', () => {
  it('discards legacy version-0 snapshots before they can render', () => {
    const legacy = { items: [rj('legacy')] };
    expect(migrateRecentState(legacy, 0)).toEqual({ items: [] });
  });

  it('keeps the current masked schema intact', () => {
    const current = { items: [{ ...rj('safe'), company: MASKED_RECENT_COMPANY }] };
    expect(migrateRecentState(current, 1)).toBe(current);
  });

  it('ignores persisted history during configured async hydration', () => {
    const current = { items: [] as RecentJob[], clear: jest.fn() };
    const stale = { items: [rj('old-account')] };
    expect(mergeRecentState(stale, current, true)).toBe(current);
    expect(mergeRecentState(stale, current, false).items).toEqual(stale.items);
  });
});

describe('pushRecent', () => {
  it('prepends and dedupes by id (most-recent first)', () => {
    const list = [rj('1'), rj('2')];
    expect(pushRecent(list, rj('2')).map((r) => r.id)).toEqual(['2', '1']);
    expect(pushRecent(list, rj('3')).map((r) => r.id)).toEqual(['3', '1', '2']);
  });
  it('caps the list at RECENT_CAP', () => {
    const out = Array.from({ length: RECENT_CAP + 5 }, (_, i) => rj(String(i))).reduce((acc, r) => pushRecent(acc, r), [] as RecentJob[]);
    expect(out).toHaveLength(RECENT_CAP);
  });
  it('respects a custom cap', () => {
    expect(pushRecent([rj('1'), rj('2')], rj('3'), 2).map((r) => r.id)).toEqual(['3', '1']);
  });
});
