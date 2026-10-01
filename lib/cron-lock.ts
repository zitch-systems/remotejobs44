import { logWarn } from '@/lib/log';

export interface CronLockHandle {
  name: string;
  ownerToken: string;
}

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function acquireCronLock(
  db: RpcClient,
  name: string,
  ttlSeconds: number,
): Promise<{ handle: CronLockHandle | null; error: string | null }> {
  const ownerToken = crypto.randomUUID();
  try {
    const { data, error } = await db.rpc('acquire_cron_lock', {
      p_lock_name: name, p_owner_token: ownerToken, p_ttl_seconds: ttlSeconds,
    });
    if (error) return { handle: null, error: error.message };
    if (typeof data !== 'boolean') return { handle: null, error: 'Invalid cron lock response' };
    return { handle: data === true ? { name, ownerToken } : null, error: null };
  } catch (error: any) {
    return { handle: null, error: error?.message ?? String(error) };
  }
}

export async function releaseCronLock(db: RpcClient, handle: CronLockHandle): Promise<void> {
  try {
    const { error } = await db.rpc('release_owned_cron_lock', {
      p_lock_name: handle.name, p_owner_token: handle.ownerToken,
    });
    if (error) logWarn({ event: 'cron_lock.release_failed', lock: handle.name, error: error.message });
  } catch (error: any) {
    logWarn({ event: 'cron_lock.release_threw', lock: handle.name, error: error?.message ?? String(error) });
  }
}
