import { beforeEach, describe, expect, it, vi } from 'vitest';

let rpcResult: { data?: unknown; error?: unknown } = {};
const rpcCalls: Array<{ name: string; args: unknown }> = [];
const logErrors: unknown[] = [];

vi.mock('@/lib/cron-auth', () => ({
  requireCronSecret: () => ({ ok: true }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminSupabaseClient: () => ({
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: rpcResult.data ?? null, error: rpcResult.error ?? null };
    },
  }),
}));
vi.mock('@/lib/log', () => ({
  logError: (entry: unknown) => { logErrors.push(entry); },
}));

const { GET } = await import('./route');

beforeEach(() => {
  rpcResult = { data: { expiredDayPasses: 3, expiredPro: 2 } };
  rpcCalls.length = 0;
  logErrors.length = 0;
});

describe('expire-daily cron', () => {
  it('uses the atomic expiry RPC and preserves the response format', async () => {
    const response = await GET({} as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ expired_daily: 3, expired_pro: 2 });
    expect(rpcCalls).toEqual([{
      name: 'expire_subscriptions',
      args: { p_batch_size: 500 },
    }]);
  });

  it('logs and returns 500 when atomic expiry fails', async () => {
    rpcResult = { error: { message: 'expiry transaction failed' } };

    const response = await GET({} as any);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      expired_daily: 0,
      expired_pro: 0,
    });
    expect(logErrors).toContainEqual({
      event: 'cron.expire_daily.failed',
      error: 'expiry transaction failed',
    });
  });
});
