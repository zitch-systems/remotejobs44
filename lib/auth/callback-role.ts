// Helpers for the auth callback's optional profile-role lookup.
// The profile query must never be allowed to block or break the auth redirect:
// a freshly-created row may not exist yet and a transient database issue
// should still leave the user with a valid session.

export type ProfileRoleLoader = () => PromiseLike<string | null | undefined>;

/**
 * Resolve a profile role with a small upper bound. A null result means the
 * callback should fall back to the email-based role and let the destination
 * page retry profile loading.
 */
export async function loadCallbackProfileRole(
  load: ProfileRoleLoader,
  timeoutMs = 1_500,
): Promise<string | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const role = await Promise.race([
      load(),
      new Promise<null>(resolve => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return role ?? null;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
