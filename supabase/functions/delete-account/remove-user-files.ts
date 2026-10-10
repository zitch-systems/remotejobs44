// supabase/functions/delete-account/remove-user-files.ts
//
// Deletes every file a user has in the per-user Storage buckets. Shared by the
// `delete-account` edge function (Deno) and app/api/profile/delete-account
// (Node), so it must stay free of runtime-specific imports.
//
// Why this exists: an account is deleted by removing the auth user, and the FK
// cascade only reaches database rows. Storage objects are not rows we can
// delete with SQL (storage.protect_delete blocks that), so without this step
// the CVs and profile photos outlive the account. A CV is about the most
// personal document a job board holds, and `avatars` is a public bucket.
//
// Both buckets key objects as `<user id>/<file>` (see the storage policies in
// migration_v39_cv_storage.sql and migration_v45_avatars.sql), so a user's
// files are exactly the objects under their id.

export const USER_FILE_BUCKETS = ['cvs', 'avatars'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_PAGE = 100;
const REMOVE_BATCH = 100;
// A user has a handful of files. This only stops a list() that never returns a
// short page from looping forever.
const MAX_ENTRIES_PER_BUCKET = 10_000;

type StorageError = { message: string } | null;
interface StorageEntry {
  name: string;
  /** Storage reports folders as entries whose id is null. */
  id?: string | null;
}
interface FileApi {
  list(
    path: string,
    options: { limit: number; offset: number },
  ): Promise<{ data: StorageEntry[] | null; error: StorageError }>;
  remove(paths: string[]): Promise<{ data: unknown; error: StorageError }>;
}
/** The slice of a service-role Supabase client this needs. */
export interface StorageAdmin {
  storage: { from(bucket: string): FileApi };
}

/**
 * Remove all of `userId`'s files from `cvs` and `avatars`. Idempotent — a retry
 * after a partial failure just finds less to delete. Throws on any Storage
 * error, so callers can stop before deleting the account and let the user retry.
 */
export async function removeUserFiles(admin: StorageAdmin, userId: string): Promise<{ removed: number }> {
  // The id becomes a path prefix. An empty or malformed one must never reach
  // list(): list('') is the bucket root, i.e. every user's files.
  if (!UUID_RE.test(userId)) throw new Error('removeUserFiles: user id is not a UUID');

  let removed = 0;
  for (const bucket of USER_FILE_BUCKETS) {
    const files = admin.storage.from(bucket);
    const paths = await listFiles(files, bucket, userId);
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await files.remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) throw new Error(`removeUserFiles: removing from ${bucket} failed: ${error.message}`);
    }
    removed += paths.length;
  }
  return { removed };
}

// Every file under `root`, descending into sub-folders. Only ever goes deeper
// than `root`, never up.
async function listFiles(files: FileApi, bucket: string, root: string): Promise<string[]> {
  const found: string[] = [];
  const pending = [root];
  let seen = 0;
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await files.list(dir, { limit: LIST_PAGE, offset });
      if (error) throw new Error(`removeUserFiles: listing ${bucket} failed: ${error.message}`);
      const page = data ?? [];
      for (const entry of page) {
        (entry.id === null ? pending : found).push(`${dir}/${entry.name}`);
      }
      seen += page.length;
      if (seen > MAX_ENTRIES_PER_BUCKET) {
        throw new Error(`removeUserFiles: listing ${bucket} did not terminate`);
      }
      if (page.length < LIST_PAGE) break;
    }
  }
  return found;
}
