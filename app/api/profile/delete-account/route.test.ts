// Route-handler tests for POST /api/profile/delete-account. Supabase is stubbed
// (an in-memory Storage, a recording admin client); the confirmation, admin
// guard and file-cleanup logic run for real. The properties that matter:
//   * the user's CV and photos are deleted along with the account,
//   * they are deleted BEFORE the auth user, and a Storage failure stops the
//     deletion with nothing changed (so the user can retry),
//   * the guards (signed in, typed confirmation, not an admin) still hold.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeStorage, type FakeStorage } from '@/lib/test/storage-mock';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

let signedInUser: { id: string } | null;
let role: string;
let deleteUserError: { message: string } | null;
let storage: FakeStorage;
let events: string[];
let logged: Record<string, unknown>[];

const admin = {
  from: (table: string) => {
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role } }) }) }) };
    }
    if (table === 'subscriptions') {
      return {
        update: () => ({
          eq: async () => {
            events.push('cancel subscription');
            return { error: null };
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
  get storage() {
    return storage.client.storage;
  },
  auth: {
    admin: {
      deleteUser: async (id: string) => {
        events.push(`delete user ${id}`);
        return { error: deleteUserError };
      },
    },
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: signedInUser }, error: null }),
      signOut: async () => {
        events.push('sign out');
      },
    },
  }),
  createAdminSupabaseClient: () => admin,
}));
vi.mock('@/lib/log', () => ({
  logError: (entry: Record<string, unknown>) => logged.push(entry),
  logWarn: () => {},
  logInfo: () => {},
}));

const { POST } = await import('./route');

const post = (body: unknown) =>
  new NextRequest('https://example.test/api/profile/delete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const seed = () => ({
  cvs: [`${USER}/cv.pdf`, `${USER}/cv.docx`, `${OTHER}/cv.pdf`],
  avatars: [`${USER}/avatar-1.jpg`, `${USER}/avatar-2.png`, `${OTHER}/avatar-9.jpg`],
});

beforeEach(() => {
  signedInUser = { id: USER };
  role = 'user';
  deleteUserError = null;
  events = [];
  logged = [];
  storage = makeFakeStorage(seed(), { log: events });
});

const untouched = () => {
  expect(events).toEqual([]);
  expect(storage.calls).toHaveLength(0);
  expect(storage.buckets.cvs.size).toBe(3);
  expect(storage.buckets.avatars.size).toBe(3);
};

describe('POST /api/profile/delete-account — guards', () => {
  it('401s a request with no signed-in user and touches nothing', async () => {
    signedInUser = null;
    const res = await POST(post({ confirm: 'DELETE' }));
    expect(res.status).toBe(401);
    untouched();
  });

  it('400s without the typed confirmation and touches nothing', async () => {
    for (const body of [{}, { confirm: 'delete' }, { confirm: true }, { confirm: 'DELETE ' }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
    }
    untouched();
  });

  it('400s an unparseable body', async () => {
    const req = new NextRequest('https://example.test/api/profile/delete-account', { method: 'POST', body: 'not json' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    untouched();
  });

  it('refuses to delete an admin and touches nothing', async () => {
    role = 'admin';
    const res = await POST(post({ confirm: 'DELETE' }));
    expect(res.status).toBe(400);
    untouched();
  });
});

describe('POST /api/profile/delete-account — deleting the account', () => {
  it('removes the user’s CVs and photos and no one else’s', async () => {
    const res = await POST(post({ confirm: 'DELETE' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect([...storage.buckets.cvs]).toEqual([`${OTHER}/cv.pdf`]);
    expect([...storage.buckets.avatars]).toEqual([`${OTHER}/avatar-9.jpg`]);
  });

  it('removes the files before the account, then signs out', async () => {
    await POST(post({ confirm: 'DELETE' }));

    const firstRemove = events.indexOf('remove cvs');
    const lastRemove = events.lastIndexOf('remove avatars');
    const deletion = events.indexOf(`delete user ${USER}`);
    expect(firstRemove).toBeGreaterThanOrEqual(0);
    expect(lastRemove).toBeGreaterThan(firstRemove);
    expect(deletion).toBeGreaterThan(lastRemove);
    expect(events.indexOf('cancel subscription')).toBeGreaterThan(lastRemove);
    expect(events[events.length - 1]).toBe('sign out');
  });

  it('stops with nothing changed when Storage fails, so the user can retry', async () => {
    storage = makeFakeStorage(seed(), {
      log: events,
      failOn: (c) => (c.op === 'list' && c.bucket === 'avatars' ? 'storage unavailable' : undefined),
    });

    const res = await POST(post({ confirm: 'DELETE' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Account deletion failed. Please try again.');
    // The internal reason is logged, not returned to the client.
    expect(JSON.stringify(body)).not.toContain('storage unavailable');
    expect(logged).toEqual([
      expect.objectContaining({ event: 'account.storage_cleanup_failed', user_id: USER }),
    ]);
    expect(events.some((e) => e.startsWith('delete user'))).toBe(false);
    expect(events).not.toContain('cancel subscription');
    expect(events).not.toContain('sign out');
  });

  it('a retry after a partial Storage failure completes the deletion', async () => {
    let failing = true;
    storage = makeFakeStorage(seed(), {
      log: events,
      failOn: (c) => (failing && c.op === 'list' && c.bucket === 'avatars' ? 'timeout' : undefined),
    });

    expect((await POST(post({ confirm: 'DELETE' }))).status).toBe(500);
    failing = false;
    events.length = 0;
    expect((await POST(post({ confirm: 'DELETE' }))).status).toBe(200);

    expect([...storage.buckets.cvs]).toEqual([`${OTHER}/cv.pdf`]);
    expect([...storage.buckets.avatars]).toEqual([`${OTHER}/avatar-9.jpg`]);
    expect(events).toContain(`delete user ${USER}`);
  });

  it('500s with a generic message when the auth user cannot be deleted', async () => {
    deleteUserError = { message: '[GoTrueError] internal detail' };

    const res = await POST(post({ confirm: 'DELETE' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Account deletion failed. Please try again.');
    expect(JSON.stringify(body)).not.toContain('GoTrueError');
    expect(logged).toEqual([expect.objectContaining({ event: 'account.delete_failed', user_id: USER })]);
    expect(events).not.toContain('sign out');
  });
});
