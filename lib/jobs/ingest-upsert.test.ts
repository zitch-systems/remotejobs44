import { describe, expect, it, vi } from 'vitest';
import { upsertJobsChunked } from './ingest-upsert';

function client(responses: any[]) {
  const select = vi.fn();
  responses.forEach(response => select.mockResolvedValueOnce(response));
  const upsert = vi.fn(() => ({ select }));
  return { db: { from: () => ({ upsert }) } as any, upsert };
}
const timeout = { data: null, error: { code: '57014', message: 'statement timeout' } };
const ok = { data: [{ id: 'saved' }], error: null };

describe('upsertJobsChunked recovery', () => {
  it('recovers a transient row timeout without counting a failed import', async () => {
    const { db, upsert } = client([timeout, timeout, ok]);
    expect(await upsertJobsChunked(db, [{ apply_url: 'https://example.com/job', source: 'arbeitnow' }]))
      .toEqual({ inserted: 1, failed: 0, firstError: null });
    expect(upsert).toHaveBeenCalledTimes(3);
  });
  it('caps retries and preserves a persistent timeout', async () => {
    const { db, upsert } = client([timeout, timeout, timeout]);
    expect(await upsertJobsChunked(db, [{ apply_url: 'https://example.com/job' }]))
      .toEqual({ inserted: 0, failed: 1, firstError: 'statement timeout' });
    expect(upsert).toHaveBeenCalledTimes(3);
  });
  it('does not retry permanent validation failures', async () => {
    const invalid = { data: null, error: { code: '22P02', message: 'invalid integer' } };
    const { db, upsert } = client([invalid, invalid]);
    expect(await upsertJobsChunked(db, [{ apply_url: 'https://example.com/job' }]))
      .toEqual({ inserted: 0, failed: 1, firstError: 'invalid integer' });
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
