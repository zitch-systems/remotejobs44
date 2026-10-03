export type FreshnessWriteError = { message: string; code?: string | null };

export async function updateFreshnessIds(
  ids: string[],
  write: (ids: string[]) => PromiseLike<{ count: number | null; error: FreshnessWriteError | null }>,
  deadlineAt: number,
): Promise<{ updated: number; error: FreshnessWriteError | null }> {
  const queue = [ids];
  let updated = 0;
  let attempts = 0;
  while (queue.length > 0) {
    if (Date.now() >= deadlineAt || attempts >= 12) {
      return { updated, error: { message: 'daily freshness write retry budget exhausted' } };
    }
    const batch = queue.shift()!;
    attempts++;
    const { count, error } = await write(batch);
    if (!error) {
      updated += count ?? 0;
      continue;
    }
    const timeout = error.code === '57014' || /statement timeout|canceling statement/i.test(error.message);
    if (!timeout || batch.length === 1) return { updated, error };
    const middle = Math.ceil(batch.length / 2);
    queue.unshift(batch.slice(middle), batch.slice(0, middle));
  }
  return { updated, error: null };
}
