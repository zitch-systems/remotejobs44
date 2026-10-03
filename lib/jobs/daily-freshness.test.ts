import { describe, expect, it, vi } from 'vitest';
import { updateFreshnessIds } from './daily-freshness';

describe('updateFreshnessIds', () => {
  it('splits a timed-out update and counts recovered rows', async () => {
    const write = vi.fn(async (ids: string[]) => ids.length > 2
      ? { count: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
      : { count: ids.length, error: null });
    const result = await updateFreshnessIds(['1', '2', '3', '4', '5'], write, Date.now() + 10_000);
    expect(result).toEqual({ updated: 5, error: null });
    expect(write.mock.calls.map(([ids]) => ids.length)).toEqual([5, 2, 3, 1, 2]);
  });

  it('surfaces a permanent leaf timeout after bounded splitting', async () => {
    const error = { code: '57014', message: 'canceling statement due to statement timeout' };
    const write = vi.fn(async () => ({ count: null, error }));
    const result = await updateFreshnessIds(['1', '2'], write, Date.now() + 10_000);
    expect(result).toEqual({ updated: 0, error });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('does not split or retry a non-timeout error', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const write = vi.fn(async () => ({ count: null, error }));
    expect(await updateFreshnessIds(['1', '2'], write, Date.now() + 10_000))
      .toEqual({ updated: 0, error });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
