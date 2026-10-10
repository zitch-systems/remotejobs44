// lib/test/storage-mock.ts — an in-memory stand-in for the slice of the Supabase
// Storage API that the account-deletion cleanup uses (list + remove). NOT a test
// file itself (no `.test.ts`), so vitest doesn't execute it directly.
//
// It mimics the behaviours the cleanup relies on: list(path) returns the direct
// children of `path/`, sub-folders as entries whose id is null, sorted by name
// and paged by limit/offset; remove(paths) deletes exact object names only.
import type { StorageAdmin } from '@/supabase/functions/delete-account/remove-user-files';

export interface StorageCall {
  op: 'list' | 'remove';
  bucket: string;
  /** list: the folder being listed. */
  path?: string;
  limit?: number;
  offset?: number;
  /** remove: the object names in this request. */
  paths?: string[];
}

export interface FakeStorage {
  client: StorageAdmin;
  /** bucket -> object names currently stored. */
  buckets: Record<string, Set<string>>;
  calls: StorageCall[];
}

export interface FakeStorageOptions {
  /** Push "<op> <bucket>" here as calls happen, to assert ordering against other effects. */
  log?: string[];
  /** Return a message to make that call fail with a Storage-style error. */
  failOn?: (call: StorageCall) => string | undefined;
}

export function makeFakeStorage(initial: Record<string, string[]>, options: FakeStorageOptions = {}): FakeStorage {
  const buckets: Record<string, Set<string>> = {};
  for (const [bucket, names] of Object.entries(initial)) buckets[bucket] = new Set(names);
  const calls: StorageCall[] = [];

  const begin = (call: StorageCall) => {
    calls.push(call);
    options.log?.push(`${call.op} ${call.bucket}`);
    const message = options.failOn?.(call);
    return message ? { data: null, error: { message } } : undefined;
  };

  const client: StorageAdmin = {
    storage: {
      from(bucket: string) {
        const objects = (buckets[bucket] ??= new Set());
        return {
          async list(path, { limit, offset }) {
            const failure = begin({ op: 'list', bucket, path, limit, offset });
            if (failure) return failure;
            const prefix = path === '' ? '' : `${path}/`;
            const children = new Map<string, boolean>(); // child name -> is a folder
            for (const name of objects) {
              if (!name.startsWith(prefix)) continue;
              const rest = name.slice(prefix.length);
              const slash = rest.indexOf('/');
              if (slash === -1) children.set(rest, children.get(rest) ?? false);
              else children.set(rest.slice(0, slash), true);
            }
            const data = [...children]
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .slice(offset, offset + limit)
              .map(([name, folder]) => ({ name, id: folder ? null : `obj:${bucket}:${prefix}${name}` }));
            return { data, error: null };
          },
          async remove(paths) {
            const failure = begin({ op: 'remove', bucket, paths });
            if (failure) return failure;
            const removed = paths.filter((p) => objects.delete(p)).map((name) => ({ name }));
            return { data: removed, error: null };
          },
        };
      },
    },
  };

  return { client, buckets, calls };
}
