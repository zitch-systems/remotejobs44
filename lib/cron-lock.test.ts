import { describe, expect, it, vi } from 'vitest';
import { acquireCronLock, releaseCronLock } from './cron-lock';

describe('owned cron locks', () => {
  it('fails closed for a malformed acquisition response', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: 'true', error: null }) };
    const acquired = await acquireCronLock(db, 'ingest', 600);
    expect(acquired.handle).toBeNull();
    expect(acquired.error).toBeTruthy();
  });
  it('fails closed when lock acquisition errors', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } }) };
    await expect(acquireCronLock(db, 'ingest', 600)).resolves.toEqual({
      handle: null, error: 'RPC unavailable',
    });
  });

  it('releases with the exact owner token returned to the caller', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const db = { rpc };
    const acquired = await acquireCronLock(db, 'jobspy', 600);
    expect(acquired.handle?.ownerToken).toMatch(/^[0-9a-f-]{36}$/);
    await releaseCronLock(db, acquired.handle!);
    expect(rpc).toHaveBeenLastCalledWith('release_owned_cron_lock', {
      p_lock_name: 'jobspy', p_owner_token: acquired.handle!.ownerToken,
    });
  });
});
