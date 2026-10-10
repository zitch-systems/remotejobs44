// Tests for the `delete-account` edge function (what the mobile app calls). Like
// lib/paystack/edge-functions.test.ts, the function's real source is transpiled
// and run in a vm sandbox with a stubbed `Deno` and Supabase client — so what is
// tested is the code that ships, not a copy. The shared Storage cleanup it
// imports is loaded from its real source too. The properties that matter:
//   * the caller's CV and photos are deleted along with the account,
//   * before the rows and the auth user, and a Storage failure stops it with
//     nothing else changed (so the user can retry),
//   * the existing guards (POST only, signed in) still hold.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeStorage, type FakeStorage, type FakeStorageOptions } from '@/lib/test/storage-mock';

const ROOT = path.resolve(__dirname, '../..');
const FUNCTION = 'supabase/functions/delete-account/index.ts';
const SHARED = 'supabase/functions/delete-account/remove-user-files.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function transpile(relativePath: string): Promise<string> {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

async function loadShared(): Promise<Record<string, unknown>> {
  const loaded = { exports: {} as Record<string, unknown> };
  new vm.Script(await transpile(SHARED), { filename: SHARED }).runInContext(
    vm.createContext({ module: loaded, exports: loaded.exports, Error }),
  );
  return loaded.exports;
}

type Options = {
  /** The user the JWT resolves to; null = unknown token. */
  user?: { id: string } | null;
  files?: Record<string, string[]>;
  storage?: FakeStorageOptions;
  deleteUserError?: { message: string } | null;
};

async function edgeRuntime(options: Options = {}) {
  const events: string[] = [];
  const storage: FakeStorage = makeFakeStorage(
    options.files ?? {
      cvs: [`${USER}/cv.pdf`, `${OTHER}/cv.pdf`],
      avatars: [`${USER}/avatar-1.jpg`, `${OTHER}/avatar-9.jpg`],
    },
    { log: events, ...options.storage },
  );
  const consoleError = vi.fn();

  const createClient = vi.fn((_url: string, key: string) => {
    if (key === 'anon-key') {
      return {
        auth: {
          getUser: async () => ({ data: { user: options.user === undefined ? { id: USER } : options.user } }),
        },
      };
    }
    return {
      storage: storage.client.storage,
      from: (table: string) => ({
        delete: () => ({
          eq: async (column: string) => {
            events.push(`delete ${table}.${column}`);
            return { error: null };
          },
        }),
      }),
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            events.push(`delete user ${id}`);
            return { error: options.deleteUserError ?? null };
          },
        },
      },
    };
  });

  const shared = await loadShared();
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const context = vm.createContext({
    console: { error: consoleError, log: vi.fn(), warn: vi.fn() },
    Deno: {
      env: {
        get: (name: string) =>
          ({
            SUPABASE_URL: 'https://project.supabase.co',
            SUPABASE_ANON_KEY: 'anon-key',
            SUPABASE_SERVICE_ROLE_KEY: 'service-key',
          })[name],
      },
      serve: (candidate: (request: Request) => Promise<Response>) => {
        handler = candidate;
      },
    },
    exports: {},
    Headers,
    module: { exports: {} },
    Request,
    Response,
    require: (specifier: string) => {
      if (specifier === 'https://esm.sh/@supabase/supabase-js@2') return { createClient };
      if (specifier === './remove-user-files.ts') return shared;
      throw new Error(`Unexpected edge import: ${specifier}`);
    },
    URL,
  });
  new vm.Script(await transpile(FUNCTION), { filename: FUNCTION }).runInContext(context);
  if (!handler) throw new Error('Edge function did not register a handler');

  return {
    events,
    storage,
    consoleError,
    call: (init: RequestInit & { auth?: false } = {}) =>
      handler!(
        new Request('https://edge.example.test/delete-account', {
          method: 'POST',
          headers: init.auth === false ? {} : { Authorization: 'Bearer user-jwt' },
          ...init,
        }),
      ),
  };
}

describe('delete-account edge function — guards', () => {
  it('only accepts POST', async () => {
    const edge = await edgeRuntime();
    const res = await edge.call({ method: 'GET' });
    expect(res.status).toBe(405);
    expect(edge.events).toEqual([]);
  });

  it('401s a request with no Authorization header', async () => {
    const edge = await edgeRuntime();
    const res = await edge.call({ auth: false });
    expect(res.status).toBe(401);
    expect(edge.events).toEqual([]);
  });

  it('401s a token that does not resolve to a user, touching nothing', async () => {
    const edge = await edgeRuntime({ user: null });
    const res = await edge.call();
    expect(res.status).toBe(401);
    expect(edge.events).toEqual([]);
    expect(edge.storage.calls).toHaveLength(0);
  });
});

describe('delete-account edge function — deleting the account', () => {
  it('removes the caller’s CVs and photos and no one else’s', async () => {
    const edge = await edgeRuntime();

    const res = await edge.call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect([...edge.storage.buckets.cvs]).toEqual([`${OTHER}/cv.pdf`]);
    expect([...edge.storage.buckets.avatars]).toEqual([`${OTHER}/avatar-9.jpg`]);
  });

  it('removes the files, then the rows, then the auth user', async () => {
    const edge = await edgeRuntime();

    await edge.call();

    const lastFileOp = Math.max(edge.events.lastIndexOf('remove cvs'), edge.events.lastIndexOf('remove avatars'));
    const firstRowDelete = edge.events.findIndex((e) => e.startsWith('delete ') && !e.startsWith('delete user'));
    const userDelete = edge.events.indexOf(`delete user ${USER}`);
    expect(lastFileOp).toBeGreaterThanOrEqual(0);
    expect(firstRowDelete).toBeGreaterThan(lastFileOp);
    expect(edge.events).toContain('delete profiles.id');
    expect(userDelete).toBeGreaterThan(firstRowDelete);
  });

  it('stops with nothing else changed when Storage fails, so the user can retry', async () => {
    const edge = await edgeRuntime({
      storage: { failOn: (c) => (c.op === 'list' && c.bucket === 'cvs' ? 'storage unavailable' : undefined) },
    });

    const res = await edge.call();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/could not remove your files/i);
    expect(edge.events.some((e) => e.startsWith('delete '))).toBe(false);
    expect(edge.consoleError).toHaveBeenCalled();
    expect(edge.storage.buckets.cvs.size).toBe(2);
  });

  it('500s when the auth user cannot be deleted', async () => {
    const edge = await edgeRuntime({ deleteUserError: { message: 'boom' } });

    const res = await edge.call();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
