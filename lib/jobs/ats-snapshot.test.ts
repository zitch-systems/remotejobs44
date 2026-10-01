import { describe, expect, it, vi } from 'vitest';
import { syncATSSnapshot } from './ats-snapshot';

describe('syncATSSnapshot', () => {
  it('commits a large metadata snapshot in small writes before retiring missing jobs', async () => {
    const rpc = vi.fn().mockImplementation(async (name, args) => ({
      data: name === 'update_ats_metadata' ? { updated: args.p_jobs.length, reactivated: 0 } : 0,
      error: null,
    }));
    const rows = Array.from({ length: 61 }, (_, i) => ({ apply_url: `https://example.test/jobs/${i}` }));
    const result = await syncATSSnapshot({ rpc } as any, 'https://example.test/board', rows, true);
    expect(result.updated).toBe(61);
    expect(rpc.mock.calls.slice(0, -1).map(([, args]) => args.p_jobs.length)).toEqual([25, 25, 11]);
    expect(rpc.mock.calls.at(-1)?.[0]).toBe('retire_missing_ats_jobs');
  });
  it('updates metadata and retires missing jobs only for complete snapshots', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { updated: 2, reactivated: 1 }, error: null })
      .mockResolvedValueOnce({ data: 3, error: null });

    const result = await syncATSSnapshot({ rpc } as any, 'https://example.test/board', [
      { apply_url: 'https://example.test/jobs/1', salary_text: '$120k' },
      { apply_url: 'https://example.test/jobs/2', workplace_hint: 'remote' },
    ], true, 'test');

    expect(result).toEqual({ updated: 2, reactivated: 1, removed: 3, errors: 0 });
    expect(rpc).toHaveBeenNthCalledWith(2, 'retire_missing_ats_jobs', {
      p_source_url: 'https://example.test/board',
      p_seen_urls: ['https://example.test/jobs/1', 'https://example.test/jobs/2'],
    });
  });

  it('never retires jobs from a partial provider response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { updated: 1, reactivated: 0 }, error: null });

    const result = await syncATSSnapshot({ rpc } as any, 'https://example.test/board', [
      { apply_url: 'https://example.test/jobs/1' },
    ], false, 'test');

    expect(result.removed).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith('retire_missing_ats_jobs', expect.anything());
  });
});
