// Route-handler tests for POST /api/cv. Auth, Supabase and Storage are stubbed;
// the plan gate, rate-limit handling, MIME check and magic-byte check run for
// real. What matters for the native app: the bearer token reaches the auth
// helper, the multipart field is `cv`, and an app upload is subject to exactly
// the same gates as the web's.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeSupabaseMock, type QueryContext, type QueryResolver } from '@/lib/test/supabase-mock';

const USER = '11111111-1111-4111-8111-111111111111';

let authResult: { ok: true; user: Record<string, unknown>; supabase: any } | { ok: false };
let profileResolver: QueryResolver;
let rateLimitResult: { success: boolean; resetAt?: number };
const authenticate = vi.fn(async (_req?: unknown) => authResult);
const uploads: Array<{ path: string; size: number; options: unknown }> = [];
const adminWrites: QueryContext[] = [];
let storageError: unknown;

vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: (req?: unknown) => authenticate(req) }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({}),
  createAdminSupabaseClient: () => makeSupabaseMock((ctx) => {
    if (ctx.steps.includes('update')) adminWrites.push(ctx);
    return {};
  }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => rateLimitResult }));
vi.mock('@/lib/auth/profile-completion-persist', () => ({ recomputeAndPersistProfileCompletion: async () => {} }));
vi.mock('@vercel/functions', () => ({ waitUntil: () => {} }));
vi.mock('@/lib/log', () => ({ logError: () => {}, logWarn: () => {}, logInfo: () => {} }));

const { POST } = await import('./route');

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

/** The signed-in user's client: profiles via the resolver, Storage via spies. */
function userClient() {
  const client: any = makeSupabaseMock((ctx) => profileResolver(ctx));
  client.storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: Buffer, options: unknown) => {
        uploads.push({ path: `${bucket}:${path}`, size: body.length, options });
        return { error: storageError ?? null };
      },
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}?t=1` }, error: null }),
    }),
  };
  return client;
}

const user = { id: USER, email: 'ada@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
const upload = (bytes: Uint8Array, opts: { field?: string; type?: string; headers?: Record<string, string> } = {}) => {
  const form = new FormData();
  form.append(opts.field ?? 'cv', new File([new Uint8Array(bytes)], 'cv.pdf', { type: opts.type ?? 'application/pdf' }));
  return new NextRequest('https://example.test/api/cv', { method: 'POST', headers: opts.headers, body: form });
};

beforeEach(() => {
  uploads.length = 0;
  adminWrites.length = 0;
  storageError = undefined;
  rateLimitResult = { success: true };
  authenticate.mockClear();
  authResult = { ok: true, user, supabase: userClient() };
  profileResolver = (ctx) => (ctx.table === 'profiles' ? { data: { plan: 'pro', role: 'user', plan_expires_at: '2099-01-01T00:00:00Z' } } : {});
});

describe('POST /api/cv — authentication and gates', () => {
  it('401s an unauthenticated request', async () => {
    authResult = { ok: false };
    const res = await POST(upload(PDF));
    expect(res.status).toBe(401);
    expect(uploads).toHaveLength(0);
  });

  it('hands the request to the auth helper, so the app’s bearer token is honoured', async () => {
    const req = upload(PDF, { headers: { authorization: 'Bearer app-token' } });
    await POST(req);
    expect(authenticate).toHaveBeenCalledWith(req);
  });

  it('403s an unconfirmed email', async () => {
    authResult = { ok: true, user: { ...user, email_confirmed_at: null }, supabase: userClient() };
    const res = await POST(upload(PDF));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/confirm your email/i);
    expect(uploads).toHaveLength(0);
  });

  it('keeps CV upload a Pro feature for app uploads too', async () => {
    profileResolver = () => ({ data: { plan: 'free', role: 'user', plan_expires_at: null } });
    const res = await POST(upload(PDF, { headers: { authorization: 'Bearer app-token' } }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Pro feature/);
    expect(uploads).toHaveLength(0);
  });

  it('treats a lapsed Pro plan as free', async () => {
    profileResolver = () => ({ data: { plan: 'pro', role: 'user', plan_expires_at: '2020-01-01T00:00:00Z' } });
    expect((await POST(upload(PDF))).status).toBe(403);
  });

  it('429s with Retry-After when the per-user limit is hit', async () => {
    rateLimitResult = { success: false, resetAt: Date.now() + 90_000 };
    const res = await POST(upload(PDF));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(uploads).toHaveLength(0);
  });
});

describe('POST /api/cv — the file', () => {
  it('stores a valid PDF in the user’s own folder with the user-scoped client and records the path', async () => {
    const res = await POST(upload(PDF, { headers: { authorization: 'Bearer app-token' } }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      url: `https://signed.example/${USER}/cv.pdf?t=1`,
      path: `${USER}/cv.pdf`,
    });
    expect(uploads).toEqual([
      { path: `cvs:${USER}/cv.pdf`, size: PDF.length, options: { contentType: 'application/pdf', upsert: true } },
    ]);
    expect(adminWrites).toHaveLength(1);
    expect(adminWrites[0].payload).toEqual({ cv_url: `${USER}/cv.pdf` });
    expect(adminWrites[0].eq).toEqual({ id: USER });
  });

  it('requires the multipart field to be named "cv"', async () => {
    const res = await POST(upload(PDF, { field: 'file' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No file provided');
    expect(uploads).toHaveLength(0);
  });

  it('rejects bytes that do not match the claimed type', async () => {
    const res = await POST(upload(HTML, { type: 'application/pdf' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/don’t match the file type/);
    expect(uploads).toHaveLength(0);
  });

  it('rejects types other than PDF and Word', async () => {
    const res = await POST(upload(PDF, { type: 'image/png' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Only PDF and Word/);
  });

  it('reports a storage failure generically without recording a CV path', async () => {
    storageError = { message: 'bucket detail that must not leak' };
    const res = await POST(upload(PDF));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('bucket detail');
    expect(adminWrites).toHaveLength(0);
  });
});
