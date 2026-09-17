import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authResult: { data: { user: null }, error: null } as any,
  profileResult: { data: null, error: null } as any,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => state.authResult },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => state.profileResult,
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/auth/mfa', () => ({ ADMIN_MFA_REQUIRED: false }));
vi.mock('@/lib/auth/admin-2fa-server', () => ({
  ADMIN_2FA_COOKIE: 'admin_2fa',
  verifySession: () => false,
}));

const { getAdminUser } = await import('./auth');

const ALLOWLISTED_EMAIL = 'admin@remotejobs44.com';

function authenticate(email: string) {
  state.authResult = {
    data: { user: { id: 'admin-user-id', email } },
    error: null,
  };
}

async function expectDenied(
  result: Awaited<ReturnType<typeof getAdminUser>>,
  status: number,
  body: unknown,
) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected admin access to be denied');
  expect(result.res.status).toBe(status);
  await expect(result.res.json()).resolves.toEqual(body);
}

beforeEach(() => {
  state.authResult = { data: { user: null }, error: null };
  state.profileResult = { data: null, error: null };
});

describe('getAdminUser authorization guard', () => {
  it('returns 503 on a profile read error even for an allowlisted email', async () => {
    authenticate(ALLOWLISTED_EMAIL);
    state.profileResult = { data: null, error: { message: 'database unavailable' } };

    await expectDenied(await getAdminUser(), 503, {
      error: 'Unable to verify admin access. Please retry.',
    });
  });

  it('returns 403 when the user profile is missing', async () => {
    authenticate(ALLOWLISTED_EMAIL);
    state.profileResult = { data: null, error: null };

    await expectDenied(await getAdminUser(), 403, { error: 'Forbidden' });
  });

  it('returns 403 for a suspended allowlisted admin', async () => {
    authenticate(ALLOWLISTED_EMAIL);
    state.profileResult = { data: { role: 'user', suspended: true }, error: null };

    await expectDenied(await getAdminUser(), 403, { error: 'Account suspended' });
  });

  it('returns 403 for an ordinary non-admin', async () => {
    authenticate('member@example.com');
    state.profileResult = { data: { role: 'user', suspended: false }, error: null };

    await expectDenied(await getAdminUser(), 403, { error: 'Forbidden' });
  });

  it('allows an active profile admin', async () => {
    authenticate('profile-admin@example.com');
    state.profileResult = { data: { role: 'admin', suspended: false }, error: null };

    await expect(getAdminUser()).resolves.toEqual({
      ok: true,
      adminId: 'admin-user-id',
      adminEmail: 'profile-admin@example.com',
    });
  });
});
