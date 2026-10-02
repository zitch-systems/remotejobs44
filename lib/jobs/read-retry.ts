type SupabaseReadResult = {
  error: { code?: string | null } | null;
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Retry one transient Postgres statement timeout, and nothing else. */
export async function retryStatementTimeout<T extends SupabaseReadResult>(
  read: () => PromiseLike<T>,
  options?: { sleep?: (ms: number) => Promise<void>; jitterMs?: () => number },
): Promise<T> {
  const first = await read();
  if (first.error?.code !== '57014') return first;

  const wait = options?.sleep ?? sleep;
  const jitterMs = options?.jitterMs ?? (() => 25 + Math.floor(Math.random() * 50));
  await wait(jitterMs());
  return read();
}
