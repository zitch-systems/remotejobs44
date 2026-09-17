import { describe, expect, it, vi } from 'vitest';
import { loadCallbackProfileRole } from './callback-role';

describe('loadCallbackProfileRole', () => {
  it('returns the database role when the profile query succeeds', async () => {
    await expect(loadCallbackProfileRole(async () => 'agent')).resolves.toBe('agent');
  });

  it('returns null when the profile query fails', async () => {
    await expect(loadCallbackProfileRole(async () => { throw new Error('temporary'); })).resolves.toBeNull();
  });

  it('does not hold the callback redirect on a stalled profile query', async () => {
    vi.useFakeTimers();
    try {
      const pending = loadCallbackProfileRole(() => new Promise(() => {}), 100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
