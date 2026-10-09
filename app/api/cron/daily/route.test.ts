import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSupabaseMock, type QueryResolver } from '@/lib/test/supabase-mock';

let resolver: QueryResolver = () => ({});
let ingestResult: any;
let reconcileResult: any;
let expiryResult: { data?: unknown; error?: unknown };
let emailSent = true;
let onSend: () => void = () => {};
let sendCount = 0;
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
vi.mock('@/lib/email/send', () => ({ sendEmail: async () => { sendCount += 1; onSend(); return emailSent; } }));
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
  emailSent = true;
  onSend = () => {};
  sendCount = 0;
});

describe('daily cron failure reporting', () => {
  it('reports rejected email delivery as a failure without counting it sent', async () => {
    emailSent = false;
    resolver = (ctx) => {
      if (ctx.table === 'job_alerts') return { data: [{
        user_id: 'user-1', category: 'all', keywords: '',
        profiles: { name: 'Ada', email: 'ada@example.test', plan: 'pro' },
      }] };
      if (ctx.table === 'jobs' && ctx.steps.includes('gte')) return { data: [{
        id: 'job-1', title: 'Engineer', company: 'Example', category: 'engineering',
      }] };
      if (ctx.table === 'jobs') return { data: [] };
      return { count: 0 };
    };
    const response = await GET({} as any);
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.failures).toContain('alerts');
    expect(body.alerts.sent).toBe(0);
  });
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

describe('daily cron alert emails', () => {
  const proAlert = (id: string, extra: Record<string, unknown> = {}) => ({
    id, user_id: `user-${id}`, category: 'all', keywords: '', ...extra,
    profiles: { name: 'Ada', email: `${id}@example.test`, plan: 'pro' },
  });
  const newJob = { id: 'job-1', title: 'Engineer', company: 'Example', category: 'engineering' };
  const alertResolver = (alerts: unknown[], onAlertUpdate?: (ctx: any) => void) => (ctx: any) => {
    if (ctx.table === 'job_alerts' && ctx.steps.includes('update')) { onAlertUpdate?.(ctx); return {}; }
    if (ctx.table === 'job_alerts') return { data: alerts };
    if (ctx.table === 'jobs' && ctx.steps.includes('gte')) return { data: [newJob] };
    if (ctx.table === 'jobs') return { data: [] };
    return { count: 0 };
  };

  it('stops starting sends once the phase budget is spent and fails the run visibly', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // The first send "takes" 90s, past the 85s alert deadline.
      onSend = () => vi.setSystemTime(Date.now() + 90_000);
      resolver = alertResolver([proAlert('a'), proAlert('b'), proAlert('c')]);
      const response = await GET({} as any);
      const body = await response.json();
      expect(sendCount).toBe(1);
      expect(response.status).toBe(500);
      expect(body.failures).toContain('alerts_deferred');
      expect(body.alerts).toMatchObject({ sent: 1, deferred: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-mail a user who was already mailed within the guard window', async () => {
    const recent = new Date(Date.now() - 3_600_000).toISOString();
    const stale = new Date(Date.now() - 30 * 3_600_000).toISOString();
    resolver = alertResolver([
      proAlert('recent', { last_sent_at: recent }),
      proAlert('stale', { last_sent_at: stale }),
      proAlert('never', { last_sent_at: null }),
    ]);
    const response = await GET({} as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(sendCount).toBe(2);
    expect(body.alerts).toMatchObject({ sent: 2, already_sent: 1, deferred: 0 });
  });

  it('records last_sent_at for the alert row after a successful send', async () => {
    const updates: Array<{ payload: any; id: unknown }> = [];
    resolver = alertResolver([proAlert('a')], ctx => updates.push({ payload: ctx.payload, id: ctx.eq.id }));
    await GET({} as any);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('a');
    expect(Date.parse(updates[0].payload.last_sent_at)).not.toBeNaN();
  });

  it('does not record last_sent_at when delivery fails', async () => {
    emailSent = false;
    const updates: unknown[] = [];
    resolver = alertResolver([proAlert('a')], ctx => updates.push(ctx.payload));
    await GET({} as any);
    expect(updates).toHaveLength(0);
  });

  it('reads least-recently-sent alerts first so a truncated run cannot starve the same users', async () => {
    let orderArgs: unknown[] | undefined;
    resolver = (ctx: any) => {
      if (ctx.table === 'job_alerts' && !ctx.steps.includes('update')) {
        const i = ctx.steps.indexOf('order');
        if (i >= 0) orderArgs = ctx.args[i];
      }
      return alertResolver([])(ctx);
    };
    await GET({} as any);
    expect(orderArgs).toEqual(['last_sent_at', { ascending: true, nullsFirst: true }]);
  });

  it('still sends when the last_sent_at migration has not been applied', async () => {
    const updates: unknown[] = [];
    resolver = (ctx: any) => {
      const selectsLastSent = ctx.table === 'job_alerts' && ctx.steps.includes('select')
        && String(ctx.args[ctx.steps.indexOf('select')][0]).includes('last_sent_at');
      if (selectsLastSent) return { error: { code: '42703', message: 'column job_alerts.last_sent_at does not exist' } };
      return alertResolver([proAlert('a')], ctx2 => updates.push(ctx2.payload))(ctx);
    };
    const response = await GET({} as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(sendCount).toBe(1);
    expect(body.alerts.sent).toBe(1);
    expect(updates).toHaveLength(0);
  });
});
