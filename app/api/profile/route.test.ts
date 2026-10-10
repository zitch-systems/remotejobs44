// Route-handler tests for PATCH /api/profile. Auth, Supabase, the welcome email
// and Vercel's waitUntil are stubbed; the field validation, the whitelist and the
// profile-completion maths run for real. The properties that matter:
//   * the app's bearer token reaches the auth helper (the route is not cookie-only),
//   * only whitelisted columns can be written, and never role / plan / suspended,
//   * an invalid field rejects the whole request before anything is written.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeSupabaseMock, type QueryContext, type QueryResolver } from '@/lib/test/supabase-mock';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SUPABASE = 'https://abcdefgh.supabase.co';

let authResult: { ok: true; user: Record<string, unknown>; supabase: unknown } | { ok: false };
let adminResolver: QueryResolver;
const writes: QueryContext[] = [];
const authenticate = vi.fn(async (_req?: unknown) => authResult);

vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: (req?: unknown) => authenticate(req) }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({}),
  createAdminSupabaseClient: () => makeSupabaseMock((ctx) => {
    if (ctx.steps.includes('update')) writes.push(ctx);
    return adminResolver(ctx);
  }),
}));
vi.mock('@/lib/email/welcome', () => ({ sendWelcomeEmailOnce: async () => {} }));
vi.mock('@vercel/functions', () => ({ waitUntil: () => {} }));
vi.mock('@/lib/log', () => ({ logError: () => {}, logWarn: () => {}, logInfo: () => {} }));

const { PATCH } = await import('./route');

const profileRow = {
  id: USER, email: 'ada@example.com', name: 'Ada', plan: 'free', role: 'user', plan_expires_at: null,
  profile_completion: 20, cv_url: null, target_role: null, cv_text: null,
};
const signedIn = { ok: true as const, user: { id: USER, email: 'ada@example.com', email_confirmed_at: '2026-01-01' }, supabase: {} };

const patch = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('https://example.test/api/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  writes.length = 0;
  authenticate.mockClear();
  authResult = signedIn;
  adminResolver = (ctx) => {
    if (ctx.table === 'profiles') return { data: profileRow };
    return { count: 0 };
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
});

describe('PATCH /api/profile — authentication', () => {
  it('401s an unauthenticated request without touching the database', async () => {
    authResult = { ok: false };
    const res = await PATCH(patch({ bio: 'hi' }));
    expect(res.status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('hands the request to the auth helper, so the app’s bearer token is honoured', async () => {
    const req = patch({ bio: 'hi' }, { authorization: 'Bearer app-token' });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(authenticate).toHaveBeenCalledWith(req);
  });
});

describe('PATCH /api/profile — the app’s fields', () => {
  it('writes validated skills, headline, bio, links, experience and avatar through the admin client', async () => {
    const avatar = `${SUPABASE}/storage/v1/object/public/avatars/${USER}/avatar-1.jpg`;
    const res = await PATCH(patch({
      skills: [' React ', 'react', 'Node'],
      headline: ' Engineer ',
      bio: 'Hi there',
      links: { github: 'https://github.com/octocat', website: '' },
      experience: [{ title: 'Dev', company: 'Acme', period: '2024', junk: 'dropped' }],
      avatar_url: avatar,
    }));

    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].eq).toEqual({ id: USER });
    expect(writes[0].payload).toEqual({
      skills: ['React', 'Node'],
      headline: 'Engineer',
      bio: 'Hi there',
      links: { github: 'https://github.com/octocat' },
      experience: [{ title: 'Dev', company: 'Acme', period: '2024' }],
      avatar_url: avatar,
      updated_at: expect.any(String),
    });
  });

  it('clears fields with null', async () => {
    const res = await PATCH(patch({ skills: null, headline: null, bio: null, links: null, experience: null, avatar_url: null }));
    expect(res.status).toBe(200);
    expect(writes[0].payload).toMatchObject({
      skills: [], headline: null, bio: null, links: {}, experience: [], avatar_url: null,
    });
  });

  it('never writes privileged columns, even when the body names them', async () => {
    const res = await PATCH(patch({
      role: 'admin', plan: 'pro', plan_expires_at: '2099-01-01', suspended: false,
      cv_url: 'someone-else/cv.pdf', profile_completion: 100, email: 'x@y.test', id: OTHER,
      bio: 'hello',
    }));
    expect(res.status).toBe(200);
    expect(Object.keys(writes[0].payload as object).sort()).toEqual(['bio', 'updated_at']);
  });

  it('rejects the whole request, writing nothing, when one field is invalid', async () => {
    const res = await PATCH(patch({ bio: 'fine', links: { website: 'javascript:alert(1)' } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/website link must be a valid http\(s\) URL/);
    expect(writes).toHaveLength(0);
  });

  it('refuses an avatar from another user’s folder', async () => {
    const res = await PATCH(patch({ avatar_url: `${SUPABASE}/storage/v1/object/public/avatars/${OTHER}/a.jpg` }));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });
});

describe('PATCH /api/profile — existing behaviour', () => {
  it('still trims and saves name and target role', async () => {
    const res = await PATCH(patch({ name: '  Ada  ', target_role: ' Engineer ' }));
    expect(res.status).toBe(200);
    expect(writes[0].payload).toMatchObject({ name: 'Ada', target_role: 'Engineer' });
  });

  it('400s when there is nothing to save, including a body of only privileged keys', async () => {
    expect((await PATCH(patch({}))).status).toBe(400);
    const res = await PATCH(patch({ role: 'admin', plan: 'pro' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No changes to save');
    expect(writes).toHaveLength(0);
  });

  it('400s a body that is not an object', async () => {
    expect((await PATCH(patch(['bio']))).status).toBe(400);
    expect((await PATCH(patch('bio'))).status).toBe(400);
  });
});
