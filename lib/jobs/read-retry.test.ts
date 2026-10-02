import { describe, expect, it, vi } from 'vitest';
import { retryStatementTimeout } from './read-retry';

describe('retryStatementTimeout', () => {
  const noWait = { sleep: vi.fn(async () => undefined), jitterMs: () => 25 };

  it('retries one statement timeout and preserves the recovered exact count', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ data: null, count: null, error: { code: '57014' } })
      .mockResolvedValueOnce({ data: [{ id: 'job-1' }], count: 43_913, error: null });

    const result = await retryStatementTimeout(read, noWait);

    expect(read).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: [{ id: 'job-1' }], count: 43_913, error: null });
    expect(noWait.sleep).toHaveBeenCalledWith(25);
  });

  it('stops after the second statement timeout', async () => {
    const timedOut = { data: null, count: null, error: { code: '57014' } };
    const read = vi.fn().mockResolvedValue(timedOut);

    expect(await retryStatementTimeout(read, noWait)).toBe(timedOut);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not retry any other database error', async () => {
    const failed = { data: null, count: null, error: { code: '42501' } };
    const read = vi.fn().mockResolvedValue(failed);

    expect(await retryStatementTimeout(read, noWait)).toBe(failed);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
