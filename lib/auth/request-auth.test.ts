import { beforeEach, describe, expect, it, vi } from 'vitest';

const bearerGetUser = vi.fn();
const cookieGetUser = vi.fn();
const createClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    createClient(...args);
    return { auth: { getUser: bearerGetUser }, tag: 'bearer-client' };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: cookieGetUser }, tag: 'cookie-client' }),
}));

const { authenticateRequest, bearerToken } = await import('./request-auth');

const request = (authorization?: string) => ({ headers: new Headers(authorization ? { authorization } : {}) });
const user = { id: 'user-1', email: 'person@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

describe('bearerToken', () => {
  it('is null when there is no Authorization header or it is another scheme', () => {
    expect(bearerToken(request())).toBeNull();
    expect(bearerToken(request('Basic dXNlcjpwYXNz'))).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken({})).toBeNull();
  });

  it('returns the token, matching the scheme case-insensitively', () => {
    expect(bearerToken(request('Bearer abc.def'))).toBe('abc.def');
    expect(bearerToken(request('bearer   abc.def  '))).toBe('abc.def');
    expect(bearerToken(request('BEARER abc'))).toBe('abc');
  });

  it('reports a present-but-empty Bearer header as an empty token', () => {
    expect(bearerToken(request('Bearer'))).toBe('');
    expect(bearerToken(request('Bearer    '))).toBe('');
  });
});

describe('authenticateRequest with a bearer token', () => {
  it('resolves the user from the token and acts as that user', async () => {
    bearerGetUser.mockResolvedValue({ data: { user }, error: null });

    const result = await authenticateRequest(request('Bearer good-token'));

    expect(result).toMatchObject({ ok: true, user, supabase: { tag: 'bearer-client' } });
    expect(bearerGetUser).toHaveBeenCalledWith('good-token');
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer good-token' } },
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    );
    expect(cookieGetUser).not.toHaveBeenCalled();
  });

  it('rejects a token Supabase refuses, without falling back to the cookie session', async () => {
    bearerGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid JWT') });
    cookieGetUser.mockResolvedValue({ data: { user }, error: null });

    expect(await authenticateRequest(request('Bearer stale-token'))).toEqual({ ok: false });
    expect(cookieGetUser).not.toHaveBeenCalled();
  });

  it.each([[[]], [{}], [{ id: '' }], [{ id: 42 }], ['user-1']])(
    'does not treat a 200 carrying %j instead of a user as signed in',
    async (notAUser) => {
      bearerGetUser.mockResolvedValue({ data: { user: notAUser }, error: null });
      expect(await authenticateRequest(request('Bearer any-token'))).toEqual({ ok: false });
    },
  );

  it('rejects an empty token without calling Supabase', async () => {
    expect(await authenticateRequest(request('Bearer'))).toEqual({ ok: false });
    expect(createClient).not.toHaveBeenCalled();
    expect(cookieGetUser).not.toHaveBeenCalled();
  });

  it('fails closed when Supabase is unreachable or the environment is unset', async () => {
    bearerGetUser.mockRejectedValue(new Error('network down'));
    expect(await authenticateRequest(request('Bearer t'))).toEqual({ ok: false });

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(await authenticateRequest(request('Bearer t'))).toEqual({ ok: false });
  });
});

describe('authenticateRequest with the cookie session', () => {
  it('uses the cookie client when there is no Bearer header', async () => {
    cookieGetUser.mockResolvedValue({ data: { user }, error: null });

    expect(await authenticateRequest(request())).toMatchObject({
      ok: true,
      user,
      supabase: { tag: 'cookie-client' },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('is unauthenticated when the cookie session is missing or invalid', async () => {
    cookieGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await authenticateRequest(request())).toEqual({ ok: false });

    cookieGetUser.mockResolvedValue({ data: { user }, error: new Error('expired') });
    expect(await authenticateRequest(request())).toEqual({ ok: false });
  });

  it('does not treat a cookie lookup that returns a non-user as signed in', async () => {
    cookieGetUser.mockResolvedValue({ data: { user: [] }, error: null });
    expect(await authenticateRequest(request())).toEqual({ ok: false });
  });

  it('still works for callers that pass no request at all', async () => {
    cookieGetUser.mockResolvedValue({ data: { user }, error: null });
    expect(await authenticateRequest()).toMatchObject({ ok: true, user });
  });
});
