// Route-handler tests for /api/applications. Auth, Supabase, profile-completion
// recompute and Vercel's waitUntil are stubbed; the plan-resolution and
// free-trial logic run for real (pure helpers). We assert the gate ORDER and
// status codes that make up the go-live apply flow.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSupabaseMock, type QueryResolver } from '@/lib/test/supabase-mock';

// ── Mutable test doubles ─────────────────────────────────────────────────
let authUser: { id: string; email?: string; email_confirmed_at?: string | null; created_at?: string } | null = null;
let serverResolver: QueryResolver = () => ({});
let adminResolver: QueryResolver = () => ({});
let rpcResolver: ((n: string, a: unknown) => any) | undefined;

function serverClient() {
  const base = makeSupabaseMock((ctx) => serverResolver(ctx));
  base.auth = { getUser: async () => ({ data: { user: authUser }, error: null }) } as any;
  return base;
}
function adminClient() {
  return makeSupabaseMock((ctx) => adminResolver(ctx), rpcResolver);
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => serverClient(),
  createAdminSupabaseClient: () => adminClient(),
}));
vi.mock('@/lib/auth/profile-completion-persist', () => ({
  recomputeAndPersistProfileCompletion: async () => {},
}));
vi.mock('@vercel/functions', () => ({ waitUntil: (_p: unknown) => {} }));
vi.mock('@/lib/log', () => ({ logInfo: () => {}, logWarn: () => {}, logError: () => {} }));

const { POST, GET } = await import('./route');

const JOB_UUID = '22222222-2222-4222-8222-222222222222';
const nowIso = '2026-07-06T00:00:00.000Z';
const confirmedUser = { id: 'user-1', email: 'a@b.com', email_confirmed_at: nowIso, created_at: nowIso };

function postReq(body: unknown) {
  return { json: async () => body } as any;
}

beforeEach(() => {
  authUser = null;
  serverResolver = () => ({});
  adminResolver = () => ({});
  rpcResolver = undefined;
});

describe('POST auth & input gates', () => {
  it('401 when unauthenticated', async () => {
    authUser = null;
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(401);
  });

  it('403 when email is not confirmed', async () => {
    authUser = { ...confirmedUser, email_confirmed_at: null };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/confirm your email/i);
  });

  it('400 when jobId is missing', async () => {
    authUser = confirmedUser;
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('400 when jobId is not a valid uuid', async () => {
    authUser = confirmedUser;
    const res = await POST(postReq({ jobId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid jobid/i);
  });

  it('409 when the user already applied to this job', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('select')) return { data: { id: 'app-existing' } };
      return {};
    };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(409);
  });
});

describe('POST plan gating', () => {
  it('403 with a renew message when a previously-paid plan has lapsed', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('select')) return { data: null };
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        // rawPlan 'pro' but expiry in the past → resolvePlan downgrades to free.
        return { data: { plan: 'pro', role: 'user', plan_expires_at: '2020-01-01T00:00:00.000Z', created_at: nowIso } };
      }
      return {};
    };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/expired|renew/i);
  });

  it('403 when a free user has exhausted the free-trial allowance', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('select')) {
        // The head:true count query for used applications.
        if (ctx.args.some(a => a?.[1] && typeof a[1] === 'object' && (a[1] as any).head)) return { count: 99 };
        return { data: null };
      }
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { plan: 'free', role: 'user', plan_expires_at: null, created_at: nowIso } };
      }
      return {};
    };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(403);
  });
});

describe('POST daily-pass gating', () => {
  it('503 (still syncing) when the day-pass subscription row is missing', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('select')) return { data: null };
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { plan: 'daily', role: 'user', plan_expires_at: '2030-01-01T00:00:00.000Z', created_at: nowIso } };
      }
      return {};
    };
    adminResolver = (ctx) => {
      if (ctx.table === 'subscriptions') return { data: null };
      return {};
    };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
  });

  it('403 when the day-pass 10-application cap is reached', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('select')) {
        if (ctx.args.some(a => a?.[1] && typeof a[1] === 'object' && (a[1] as any).head)) return { count: 10 };
        return { data: null };
      }
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { plan: 'daily', role: 'user', plan_expires_at: '2030-01-01T00:00:00.000Z', created_at: nowIso } };
      }
      return {};
    };
    adminResolver = (ctx) => {
      if (ctx.table === 'subscriptions') {
        return { data: { current_period_start: '2026-07-01T00:00:00.000Z', current_period_end: '2030-01-01T00:00:00.000Z', status: 'active' } };
      }
      return {};
    };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/10-application limit/i);
  });
});

describe('POST happy path', () => {
  it('201 and returns the created application for a pro user', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      // Insert chain is `insert().select().single()` — check insert BEFORE the
      // generic select branch so the pre-check select and the insert don't collide.
      if (ctx.table === 'applications' && ctx.steps.includes('insert')) {
        return { data: { id: 'app-new', job_id: JOB_UUID, job_title: 'Engineer', company: 'Acme', status: 'applied' } };
      }
      if (ctx.table === 'applications' && ctx.steps.includes('select')) return { data: null };
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { plan: 'pro', role: 'user', plan_expires_at: '2030-01-01T00:00:00.000Z', created_at: nowIso } };
      }
      return {};
    };
    adminResolver = (ctx) => {
      if (ctx.table === 'jobs') return { data: { id: JOB_UUID, title: 'Engineer', company: 'Acme', logo: null } };
      return {};
    };
    rpcResolver = () => ({});
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.application.id).toBe('app-new');
    expect(json.application.jobTitle).toBe('Engineer');
  });

  it('404 when the target job does not exist', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('select')) return { data: null };
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { plan: 'pro', role: 'user', plan_expires_at: '2030-01-01T00:00:00.000Z', created_at: nowIso } };
      }
      return {};
    };
    adminResolver = (ctx) => {
      if (ctx.table === 'jobs') return { data: null };
      return {};
    };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(404);
  });

  it('maps a rapid double-click unique_violation (23505) to a clean 409', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('insert')) return { error: { code: '23505' } };
      if (ctx.table === 'applications' && ctx.steps.includes('select')) return { data: null };
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { plan: 'pro', role: 'user', plan_expires_at: '2030-01-01T00:00:00.000Z', created_at: nowIso } };
      }
      return {};
    };
    adminResolver = (ctx) => {
      if (ctx.table === 'jobs') return { data: { id: JOB_UUID, title: 'Engineer', company: 'Acme', logo: null } };
      return {};
    };
    const res = await POST(postReq({ jobId: JOB_UUID }));
    expect(res.status).toBe(409);
  });
});

describe('GET', () => {
  it('401 when unauthenticated', async () => {
    authUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns the user applications, transformed', async () => {
    authUser = confirmedUser;
    serverResolver = (ctx) => {
      if (ctx.table === 'applications' && ctx.steps.includes('select')) {
        return { data: [{ id: 'a1', job_id: JOB_UUID, job_title: 'Engineer', company: 'Acme', status: 'applied' }] };
      }
      return {};
    };
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applications).toHaveLength(1);
    expect(json.applications[0].jobTitle).toBe('Engineer');
  });
});
