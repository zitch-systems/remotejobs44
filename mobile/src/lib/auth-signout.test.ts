import { clearAuthSession } from './auth-signout';

describe('clearAuthSession', () => {
  it('awaits SDK failures and removes all persisted Auth JS keys', async () => {
    const signOut = jest
      .fn()
      .mockRejectedValueOnce(new Error('request aborted'))
      .mockRejectedValueOnce(new Error('offline'));
    const removeItem = jest.fn(async (_key: string) => {});

    await clearAuthSession({ signOut, removeItem, storageKey: 'sb-project-auth-token' });

    expect(signOut).toHaveBeenNthCalledWith(1);
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(removeItem.mock.calls.map(([key]) => key)).toEqual([
      'sb-project-auth-token',
      'sb-project-auth-token-code-verifier',
      'sb-project-auth-token-user',
    ]);
  });
});
