// Unit tests for removeUserFiles — the step that makes account deletion also
// delete the user's CV and profile photos from Storage. The properties that
// matter:
//   * everything under the user's id goes, in both buckets, and nothing else,
//   * a malformed user id can never turn into a bucket-wide listing,
//   * any Storage failure surfaces, so the caller can stop before deleting the
//     account and let the user retry.
import { describe, expect, it } from 'vitest';
import { removeUserFiles, USER_FILE_BUCKETS, type StorageAdmin } from '@/supabase/functions/delete-account/remove-user-files';
import { makeFakeStorage } from '@/lib/test/storage-mock';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const remaining = (set: Set<string>) => [...set].sort();

describe('removeUserFiles', () => {
  it('covers the CV and avatar buckets', () => {
    expect([...USER_FILE_BUCKETS]).toEqual(['cvs', 'avatars']);
  });

  it('removes the user’s files from both buckets and leaves other users’ files alone', async () => {
    const fake = makeFakeStorage({
      cvs: [`${USER}/cv.pdf`, `${USER}/cv.docx`, `${OTHER}/cv.pdf`],
      avatars: [`${USER}/avatar-1.jpg`, `${USER}/avatar-2.png`, `${OTHER}/avatar-9.jpg`],
    });

    const result = await removeUserFiles(fake.client, USER);

    expect(result).toEqual({ removed: 4 });
    expect(remaining(fake.buckets.cvs)).toEqual([`${OTHER}/cv.pdf`]);
    expect(remaining(fake.buckets.avatars)).toEqual([`${OTHER}/avatar-9.jpg`]);
  });

  it('only ever lists inside the user’s own folder', async () => {
    const fake = makeFakeStorage({ cvs: [`${USER}/cv.pdf`, `${OTHER}/cv.pdf`], avatars: [] });

    await removeUserFiles(fake.client, USER);

    const listed = fake.calls.filter((c) => c.op === 'list').map((c) => c.path);
    expect(listed.length).toBeGreaterThan(0);
    for (const path of listed) expect(path!.startsWith(USER)).toBe(true);
  });

  it('descends into sub-folders', async () => {
    const fake = makeFakeStorage({
      cvs: [`${USER}/cv.pdf`, `${USER}/archive/2024/cv-old.pdf`, `${USER}/archive/notes.txt`],
      avatars: [],
    });

    const result = await removeUserFiles(fake.client, USER);

    expect(result.removed).toBe(3);
    expect(fake.buckets.cvs.size).toBe(0);
  });

  it('pages through a folder larger than one list page and removes in batches', async () => {
    const names = Array.from({ length: 250 }, (_, i) => `${USER}/avatar-${String(i).padStart(3, '0')}.jpg`);
    const fake = makeFakeStorage({ cvs: [], avatars: names });

    const result = await removeUserFiles(fake.client, USER);

    expect(result.removed).toBe(250);
    expect(fake.buckets.avatars.size).toBe(0);
    const offsets = fake.calls.filter((c) => c.op === 'list' && c.bucket === 'avatars').map((c) => c.offset);
    expect(offsets).toEqual([0, 100, 200]);
    const batches = fake.calls.filter((c) => c.op === 'remove').map((c) => c.paths!.length);
    expect(batches).toEqual([100, 100, 50]);
  });

  it('stops paging after a short page, and asks once more after a full one', async () => {
    const full = Array.from({ length: 100 }, (_, i) => `${USER}/f-${String(i).padStart(3, '0')}.jpg`);
    const fake = makeFakeStorage({ cvs: [], avatars: full });

    const result = await removeUserFiles(fake.client, USER);

    expect(result.removed).toBe(100);
    // A full first page can't prove the folder is exhausted, so a second (empty) page is requested.
    expect(fake.calls.filter((c) => c.op === 'list' && c.bucket === 'avatars').map((c) => c.offset)).toEqual([0, 100]);
    expect(fake.buckets.avatars.size).toBe(0);
  });

  it('does nothing — and issues no remove — when the user has no files', async () => {
    const fake = makeFakeStorage({ cvs: [`${OTHER}/cv.pdf`], avatars: [] });

    const result = await removeUserFiles(fake.client, USER);

    expect(result).toEqual({ removed: 0 });
    expect(fake.calls.some((c) => c.op === 'remove')).toBe(false);
    expect(fake.buckets.cvs.size).toBe(1);
  });

  it('is idempotent: a retry finds nothing left', async () => {
    const fake = makeFakeStorage({ cvs: [`${USER}/cv.pdf`], avatars: [`${USER}/avatar-1.jpg`] });

    expect(await removeUserFiles(fake.client, USER)).toEqual({ removed: 2 });
    expect(await removeUserFiles(fake.client, USER)).toEqual({ removed: 0 });
  });

  describe('refuses ids that are not a plain UUID, before any Storage call', () => {
    // list('') would be the bucket root — every user's files.
    const unsafe = [
      '',
      ' ',
      '.',
      '..',
      '*',
      'abc',
      '../etc',
      `${USER}/`,
      `${USER}/../${OTHER}`,
      `${USER}x`,
      `x${USER}`,
      USER.slice(0, -1),
      USER.replace(/-/g, ''),
    ];
    for (const id of unsafe) {
      it(JSON.stringify(id), async () => {
        const fake = makeFakeStorage({ cvs: [`${USER}/cv.pdf`, `${OTHER}/cv.pdf`], avatars: [`${OTHER}/a.jpg`] });
        await expect(removeUserFiles(fake.client, id)).rejects.toThrow('not a UUID');
        expect(fake.calls).toHaveLength(0);
        expect(fake.buckets.cvs.size).toBe(2);
      });
    }

    it('accepts upper-case UUIDs', async () => {
      const upper = USER.toUpperCase();
      const fake = makeFakeStorage({ cvs: [`${upper}/cv.pdf`], avatars: [] });
      expect(await removeUserFiles(fake.client, upper)).toEqual({ removed: 1 });
    });
  });

  describe('surfaces Storage failures so the caller can stop and retry', () => {
    it('a failed listing', async () => {
      const fake = makeFakeStorage(
        { cvs: [`${USER}/cv.pdf`], avatars: [`${USER}/a.jpg`] },
        { failOn: (c) => (c.op === 'list' && c.bucket === 'cvs' ? 'storage unavailable' : undefined) },
      );

      await expect(removeUserFiles(fake.client, USER)).rejects.toThrow(/listing cvs failed: storage unavailable/);
      expect(fake.buckets.cvs.size).toBe(1);
      expect(fake.calls.some((c) => c.op === 'remove')).toBe(false);
    });

    it('a failed removal', async () => {
      const fake = makeFakeStorage(
        { cvs: [`${USER}/cv.pdf`], avatars: [] },
        { failOn: (c) => (c.op === 'remove' ? 'denied' : undefined) },
      );

      await expect(removeUserFiles(fake.client, USER)).rejects.toThrow(/removing from cvs failed: denied/);
    });

    it('a failure in the second bucket after the first was cleared, which a retry then finishes', async () => {
      let fail = true;
      const fake = makeFakeStorage(
        { cvs: [`${USER}/cv.pdf`], avatars: [`${USER}/a.jpg`] },
        { failOn: (c) => (fail && c.bucket === 'avatars' && c.op === 'list' ? 'timeout' : undefined) },
      );

      await expect(removeUserFiles(fake.client, USER)).rejects.toThrow(/listing avatars failed/);
      expect(fake.buckets.cvs.size).toBe(0);
      expect(fake.buckets.avatars.size).toBe(1);

      fail = false;
      expect(await removeUserFiles(fake.client, USER)).toEqual({ removed: 1 });
      expect(fake.buckets.avatars.size).toBe(0);
    });
  });

  it('gives up on a listing that never ends instead of looping forever', async () => {
    const endless: StorageAdmin = {
      storage: {
        from: () => ({
          list: async (_path, { limit }) => ({
            data: Array.from({ length: limit }, (_, i) => ({ name: `f${i}`, id: 'x' })),
            error: null,
          }),
          remove: async () => ({ data: [], error: null }),
        }),
      },
    };

    await expect(removeUserFiles(endless, USER)).rejects.toThrow('did not terminate');
  });
});
