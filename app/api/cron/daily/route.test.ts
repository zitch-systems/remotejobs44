import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSupabaseMock, type QueryResolver } from '@/lib/test/supabase-mock';

let resolver: QueryResolver = () => ({});
let ingestResult: any;
let reconcileResult: any;
let expiryResult: { data?: unknown; error?: unknown };
const rpcCalls: Array<{ name: string; args: unknown }> = [];

vi.mock('@/lib/cron-auth', () => ({
  requireCronSecret: () => ({ ok: true }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminSupabaseClient: () => makeSupabaseMock(
    (ctx) => resolver(ctx),
    (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'expire_subscriptions') return expiryResult;
      if (name === 'dedupe_jobs') return { data: 0 };
      return {};
    },
  ),
}));
vi.mock('@/lib/ingest-pipeline', () => ({
  runIngest: async () => ingestResult,
}));
vi.mock('@/lib/paystack/reconcile', () => ({
  reconcilePaystackCharges: async () => reconcileResult,
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: async () => true }));
vi.mock('@/lib/email/templates', () => ({
  jobAlertEmail: () => ({ subject: 'Jobs', html: '<p>Jobs</p>' }),
}));
vi.mock('@/lib/email/unsubscribe', () => ({
  unsubscribeHeaders: () => ({}),
  unsubscribeUrl: () => 'https://remotejobs.test/unsubscribe',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/log', () => ({ logError: () => {}, logWarn: () => {} }));

const { GET } = await import('./route');

beforeEach(() => {
  resolver = (ctx) => {
    if (ctx.table === 'jobs' && ctx.steps.includes('select')) return { data: [] };
    if (ctx.table === 'job_alerts') return { data: [] };
    if (ctx.table === 'paystack_webhook_events') return { count: 0 };
    return {};
  };
  ingestResult = {
    success: true,
    totalAdded: 0,
    results: { Remotive: 0 },
    paused: [],
    at: '2030-01-01T00:00:00Z',
  };
  reconcileResult = {
    checked: 0,
    credited: 0,
    skippedRecorded: 0,
    skippedActive: 0,
    errors: 0,
  };
  expiryResult = { data: { expiredDayPasses: 4, expiredPro: 6 } };
  rpcCalls.length = 0;
});

describe('daily cron failure reporting', () => {
  it('uses atomic expiry and reports its counts in the existing daily shape', async () => {
    const response = await GET({} as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.expiry).toEqual({ expiredDayPasses: 4, expiredPro: 6 });
    expect(rpcCalls).toContainEqual({
      name: 'expire_subscriptions',
      args: { p_batch_size: 500 },
    });
  });

  it('returns 500 when the atomic expiry RPC fails', async () => {
    expiryResult = { error: { message: 'expiry RPC failed' } };

    const response = await GET({} as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.failures).toContain('expiry');
    expect(body.expiry.error).toBe('expiry RPC failed');
  });

  it('returns 500 when reconciliation completes with errors', async () => {
    reconcileResult = { ...reconcileResult, checked: 2, errors: 1 };

    const response = await GET({} as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.failures).toContain('reconcile');
    expect(body.reconcile.errors).toBe(1);
  });

  it('marks source error strings failed but leaves paused/skipped sources nonfatal', async () => {
    ingestResult.results = {
      Remotive: 'error: HTTP 503',
      Jobicy: 'paused',
      RemoteOK: 'skipped: ingest time budget exhausted, runs next cycle',
    };

    const failedResponse = await GET({} as any);
    const failedBody = await failedResponse.json();
    expect(failedResponse.status).toBe(500);
    expect(failedBody.failures).toContain('ingest');
    expect(failedBody.ingest.errors).toEqual([{ source: 'Remotive', error: 'error: HTTP 503' }]);

    ingestResult.results = {
      Jobicy: 'paused',
      RemoteOK: 'skipped: ingest time budget exhausted, runs next cycle',
    };
    const expectedResponse = await GET({} as any);
    expect(expectedResponse.status).toBe(200);
  });

  it('returns 500 when the alert subscription read fails', async () => {
    resolver = (ctx) => {
      if (ctx.table === 'jobs' && ctx.steps.includes('select')) return { data: [] };
      if (ctx.table === 'job_alerts') return { error: { message: 'alerts read failed' } };
      if (ctx.table === 'paystack_webhook_events') return { count: 0 };
      return {};
    };

    const response = await GET({} as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.failures).toContain('alerts');
    expect(body.alertsError).toBe('alerts read failed');
  });

  it('returns 500 when the alert job-candidate read fails', async () => {
    resolver = (ctx) => {
      if (ctx.table === 'job_alerts') {
        return { data: [{
          user_id: 'user-1',
          category: 'all',
          keywords: '',
          profiles: { name: 'Ada', email: 'ada@example.com', plan: 'pro' },
        }] };
      }
      if (ctx.table === 'jobs' && ctx.steps.includes('gte')) {
        return { error: { message: 'job candidates read failed' } };
      }
      if (ctx.table === 'jobs' && ctx.steps.includes('select')) return { data: [] };
      if (ctx.table === 'paystack_webhook_events') return { count: 0 };
      return {};
    };

    const response = await GET({} as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.failures).toContain('alerts');
    expect(body.alertsError).toBe('job candidates read failed');
  });
});
