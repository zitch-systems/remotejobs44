import { describe, it, expect, vi } from 'vitest';
import { batchByLength, LastSeenUpdateError, markSeenAndReactivate, touchLastSeen } from './jobs-last-seen';

describe('batchByLength', () => {
  it('returns no batches for an empty list', () => {
    expect(batchByLength([])).toEqual([]);
  });

  it('keeps a small list in a single batch', () => {
    const urls = ['https://a.example/1', 'https://a.example/2'];
    expect(batchByLength(urls)).toEqual([urls]);
  });

  it('splits on the count cap', () => {
    const urls = Array.from({ length: 250 }, (_, i) => `https://a.example/${i}`);
    const batches = batchByLength(urls, 100, 1_000_000);
    expect(batches.map(b => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(urls);
  });

  it('splits on the byte cap before the count cap', () => {
    // 40-char URLs, 100-byte budget → 2 per batch even though the count cap is 100.
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/jobs/${String(i).repeat(15)}`);
    urls.forEach(u => expect(u.length).toBe(40));
    const batches = batchByLength(urls, 100, 100);
    expect(batches.map(b => b.length)).toEqual([2, 2, 2]);
  });

  it('never drops a value that alone exceeds the byte budget', () => {
    const huge = 'https://example.com/' + 'x'.repeat(5000);
    const urls = ['https://a.example/1', huge, 'https://a.example/2'];
    const batches = batchByLength(urls, 100, 3_500);
    expect(batches.flat()).toEqual(urls);
    // The oversized value gets a batch to itself rather than dragging the
    // others into an over-long request line with it.
    expect(batches.some(b => b.length === 1 && b[0] === huge)).toBe(true);
  });

  it('keeps every batch inside the default request-line budget', () => {
    // 200 realistic ATS apply URLs — the old fixed chunk size. Percent-encoding
    // roughly doubles these on the wire, so the raw budget must stay well under
    // the 8KB nginx request-line limit or PostgREST answers 414.
    const urls = Array.from(
      { length: 200 },
      (_, i) => `https://boards.greenhouse.io/acmecorporation/jobs/${4000000 + i}`,
    );
    const batches = batchByLength(urls);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      expect(b.join('').length).toBeLessThanOrEqual(3_500);
      expect(b.length).toBeLessThanOrEqual(100);
    }
    expect(batches.flat()).toEqual(urls);
  });

  it('preserves order and loses nothing', () => {
    const urls = Array.from({ length: 137 }, (_, i) => `https://a.example/${i}`);
    expect(batchByLength(urls, 10, 200).flat()).toEqual(urls);
  });
});

describe('touchLastSeen', () => {
  function clientFor(write: (urls: string[], freshnessFilter?: string) => Promise<any>) {
    return {
      from: () => ({
        update: () => ({
          in: (_column: string, urls: string[]) => ({
            or: (filter: string) => write(urls, filter),
          }),
        }),
      }),
    } as any;
  }

  it('splits a timed-out batch and succeeds on smaller writes', async () => {
    const writes: string[][] = [];
    const client = clientFor(async urls => {
      writes.push(urls);
      return urls.length > 2
        ? { count: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
        : { count: urls.length, error: null };
    });

    await expect(touchLastSeen(client, ['1', '2', '3', '4', '5'], 'test')).resolves.toBe(5);
    expect(writes.map(batch => batch.length)).toEqual([5, 2, 3, 1, 2]);
  });

  it('does not exhaust the retry cap on a healthy large source', async () => {
    const write = vi.fn(async (urls: string[]) => ({ count: urls.length, error: null }));
    const urls = Array.from({ length: 100 }, (_, i) => `https://example.test/${i}`);
    await expect(touchLastSeen(clientFor(write), urls, 'large')).resolves.toBe(100);
    expect(write).toHaveBeenCalledTimes(20);
  });

  it('only writes active freshness when last_seen_at is older than six hours', async () => {
    const write = vi.fn(async (urls: string[], filter?: string) => ({ count: urls.length, error: null }));
    await touchLastSeen(clientFor(write), ['https://example.test/1'], 'age-gate');
    const filter = write.mock.calls[0][1];
    expect(filter).toMatch(/^last_seen_at\.is\.null,last_seen_at\.lt\./);
    const cutoff = Date.parse(filter!.split('last_seen_at.lt.')[1]);
    expect(cutoff).toBeGreaterThan(Date.now() - 6 * 60 * 60 * 1000 - 2_000);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 6 * 60 * 60 * 1000);
  });

  it('always reactivates inactive rows but age-gates already-active rows', async () => {
    const updates: Array<{ payload: Record<string, unknown>; active?: boolean; filter?: string }> = [];
    const client = {
      from: () => ({
        select: () => ({ in: () => ({ eq: async () => ({ data: [{ id: 'retired' }], error: null }) }) }),
        update: (payload: Record<string, unknown>) => ({
          in: () => ({
            eq: (_column: string, active: boolean) => {
              const entry: { payload: Record<string, unknown>; active?: boolean; filter?: string } = { payload, active };
              updates.push(entry);
              const result = Promise.resolve({ error: null }) as Promise<any> & { or(filter: string): Promise<any> };
              result.or = (filter: string) => {
                entry.filter = filter;
                return Promise.resolve({ error: null });
              };
              return result;
            },
          }),
        }),
      }),
    } as any;

    await expect(markSeenAndReactivate(client, ['https://example.test/retired'], 'reactivate')).resolves.toBe(1);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ payload: { is_active: true }, active: false });
    expect(updates[1]).toMatchObject({ payload: { last_seen_at: expect.any(String) }, active: true });
    expect(updates[1].filter).toMatch(/^last_seen_at\.is\.null,last_seen_at\.lt\./);
  });

  it('surfaces a leaf failure instead of reporting freshness success', async () => {
    const client = clientFor(async () => ({
      count: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    }));

    const update = touchLastSeen(client, ['1'], 'RemoteOK');
    await expect(update).rejects.toEqual(
      expect.objectContaining({
        name: 'LastSeenUpdateError',
        message: expect.stringContaining('RemoteOK'),
      }),
    );
    expect(LastSeenUpdateError).toBeTypeOf('function');
  });
});
