import { beforeEach, describe, expect, it, vi } from 'vitest';

let result: { data: unknown; error: { message: string } | null };

const query: any = {
  select: () => query,
  eq: () => query,
  or: () => query,
  maybeSingle: async () => result,
};

vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminSupabaseClient: () => ({ from: () => query }),
  createServerSupabaseClient: async () => ({}),
}));

const { getExpiredJobMeta, getJobDetailRow } = await import('./job-detail');

beforeEach(() => {
  result = { data: null, error: null };
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
