import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBearerRequesterPlan } from './bearer-requester-plan';

const getUser = vi.fn();
const maybeSingle = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const request = (authorization?: string) => ({
  headers: new Headers(authorization ? { authorization } : {}),
}) as any;

describe('native bearer requester plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('lets cookie auth handle requests without a bearer token', async () => {
    expect(await getBearerRequesterPlan(request())).toBeNull();
  });

  it('fails a rejected bearer token closed as anonymous', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    expect(await getBearerRequesterPlan(request('Bearer invalid'))).toBe('anon');
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('excludes an active Day Pass from employer identity entitlement', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'person@example.com' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { role: 'user', plan: 'daily', plan_expires_at: '2099-01-01', suspended: false }, error: null });
    expect(await getBearerRequesterPlan(request('Bearer valid'))).toBe('daily');
  });

  it('resolves active monthly/annual Pro records to Pro', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'person@example.com' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { role: 'user', plan: 'pro', plan_expires_at: '2099-01-01', suspended: false }, error: null });
    expect(await getBearerRequesterPlan(request('Bearer valid'))).toBe('pro');
  });

  it('does not trust an expired paid plan', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { role: 'user', plan: 'pro', plan_expires_at: '2020-01-01', suspended: false }, error: null });
    expect(await getBearerRequesterPlan(request('Bearer valid'))).toBe('free');
  });

  it('denies suspended users even when their profile has admin privileges', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { role: 'admin', plan: 'pro', suspended: true }, error: null });
    expect(await getBearerRequesterPlan(request('Bearer valid'))).toBe('anon');
  });

  it('fails closed when profile verification is unavailable', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: new Error('database unavailable') });
    expect(await getBearerRequesterPlan(request('Bearer valid'))).toBe('anon');
  });
});
