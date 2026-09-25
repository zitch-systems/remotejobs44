import { beforeEach, describe, expect, it, vi } from 'vitest';

let result: Record<string, unknown>;

vi.mock('@/lib/cron-auth', () => ({ requireCronSecret: () => ({ ok: true }) }));
vi.mock('@/lib/supabase/server', () => ({ createAdminSupabaseClient: () => ({}) }));
vi.mock('@/lib/ats-refresh', () => ({ refreshStaleATSBoards: async () => result }));
vi.mock('@/lib/log', () => ({ logError: () => {}, logWarn: () => {} }));

const { GET } = await import('./route');

beforeEach(() => {
  result = { boardsConsidered: 300, boardsRefreshed: 60, added: 0,
    reactivated: 0, removed: 0, errors: 0, timedOut: false };
});

describe('ATS cron result', () => {
  it('reports a time-budget stop as a failure with partial progress', async () => {
    result.timedOut = true;
    const response = await GET({} as any);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false, timedOut: true, boardsRefreshed: 60, boardsConsidered: 300,
    });
  });

  it('reports a complete run as successful', async () => {
    const response = await GET({} as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, timedOut: false });
  });
});
