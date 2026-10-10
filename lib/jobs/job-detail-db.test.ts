import { beforeEach, describe, expect, it, vi } from 'vitest';

let result: { data: unknown; error: { message: string } | null };

const { from, unstableCache } = vi.hoisted(() => ({
  from: vi.fn(),
  unstableCache: vi.fn(),
}));

const query: any = {
  select: () => query,
  eq: () => query,
  or: () => query,
  maybeSingle: async () => result,
};

vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ unstable_cache: unstableCache }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminSupabaseClient: () => ({ from }),
  createServerSupabaseClient: async () => ({}),
}));

const { getExpiredJobMeta, getJobDetailRow } = await import('./job-detail');

beforeEach(() => {
  result = { data: null, error: null };
  from.mockReset();
  from.mockImplementation(() => query);
  unstableCache.mockReset();
  unstableCache.mockImplementation((fn: unknown) => fn);
});

describe('job detail database failures', () => {
  it('does not turn a visible-job query failure into a cacheable not-found result', async () => {
    result = { data: null, error: { message: 'database unavailable' } };
    await expect(getJobDetailRow('00000000-0000-4000-8000-000000000001'))
      .rejects.toThrow('job-detail fetch failed: database unavailable');
  });

  it('distinguishes a closed-job probe failure from a genuine missing row', async () => {
    result = { data: null, error: { message: 'database unavailable' } };
    await expect(getExpiredJobMeta('00000000-0000-4000-8000-000000000002'))
      .rejects.toThrow('closed-job fetch failed: database unavailable');

    result = { data: null, error: null };
    await expect(getExpiredJobMeta('00000000-0000-4000-8000-000000000003'))
      .resolves.toBeNull();
  });
});

describe('malformed job ids', () => {
  // Scanner traffic hits /jobs/<anything>. None of these can be a jobs.id
  // (uuid), and Postgres would reject them with 22P02, which the lookups
  // deliberately surface as an error — i.e. a 500 instead of a 404.
  const NOT_UUIDS = [
    '',
    'abc',
    "1' OR '1'='1",
    '1; DROP TABLE jobs--',
    '../../etc/passwd',
    '00000000000040008000000000000001', // right digits, no dashes
    '00000000-0000-4000-8000-00000000000g', // right shape, non-hex digit
    '00000000-0000-4000-8000-0000000000012', // one digit too long
    '00000000-0000-4000-8000-000000000001 ', // trailing space
  ];

  it.each(NOT_UUIDS)('answers %j as "no such job" without touching the cache or database', async (id) => {
    await expect(getJobDetailRow(id)).resolves.toBeNull();
    await expect(getExpiredJobMeta(id)).resolves.toBeNull();
    expect(unstableCache).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('still looks up a well-formed uuid, in either case', async () => {
    const row = { id: '0a1b2c3d-0000-4000-8000-00000000000a', title: 'Engineer' };
    result = { data: row, error: null };

    await expect(getJobDetailRow('0A1B2C3D-0000-4000-8000-00000000000A')).resolves.toEqual(row);
    expect(unstableCache).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('jobs');
  });
});
