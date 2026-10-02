interface SignOutDependencies {
  signOut: (options?: { scope?: 'global' | 'local' | 'others' }) => Promise<unknown>;
  removeItem: (key: string) => Promise<void>;
  storageKey: string;
}

/** Finish SDK cleanup, then remove every persisted item used by Auth JS. */
export async function clearAuthSession(
  { signOut, removeItem, storageKey }: SignOutDependencies,
): Promise<void> {
  try {
    await signOut();
  } catch {
    /* the client's aborting fetch deadline guarantees this request is finished */
  }
  try {
    await signOut({ scope: 'local' });
  } catch {
    /* explicit storage cleanup below remains authoritative */
  } finally {
    await Promise.allSettled([
      removeItem(storageKey),
      removeItem(`${storageKey}-code-verifier`),
      removeItem(`${storageKey}-user`),
    ]);
  }
}
