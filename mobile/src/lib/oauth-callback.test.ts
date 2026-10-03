jest.mock('./supabase', () => ({
  supabase: { auth: { exchangeCodeForSession: jest.fn(), getSession: jest.fn() } },
}));

import { createOAuthCallbackCompleter } from './oauth-callback';

describe('OAuth callback completion', () => {
  it('shares one PKCE exchange across duplicate warm deliveries', async () => {
    let finish!: (value: { error: null }) => void;
    const exchangeCode = jest.fn(() => new Promise<{ error: null }>((resolve) => { finish = resolve; }));
    const complete = createOAuthCallbackCompleter({ exchangeCode });

    const first = complete('remotejobs44://auth-callback?code=one');
    const second = complete('remotejobs44://auth-callback?code=one');
    expect(exchangeCode).toHaveBeenCalledTimes(1);
    finish({ error: null });
    await expect(first).resolves.toEqual({ status: 'success' });
    await expect(second).resolves.toEqual({ status: 'success' });
  });

  it('rejects invalid callbacks without touching auth', async () => {
    const exchangeCode = jest.fn();
    const complete = createOAuthCallbackCompleter({ exchangeCode });
    await expect(complete('remotejobs44://auth-callback#error=access_denied')).resolves.toMatchObject({ status: 'error' });
    await expect(complete('remotejobs44://auth-callback')).resolves.toMatchObject({ status: 'error' });
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('does not accept an unrelated existing session after exchange failure', async () => {
    const complete = createOAuthCallbackCompleter({
      exchangeCode: async () => ({ error: { message: 'code already used' } }),
    });
    await expect(complete('remotejobs44://auth-callback?code=used')).resolves.toEqual({ status: 'error', message: 'code already used' });
  });

  it('evicts a failed exchange so the same callback can be retried', async () => {
    const exchangeCode = jest
      .fn()
      .mockResolvedValueOnce({ error: { message: 'temporary failure' } })
      .mockResolvedValueOnce({ error: null });
    const complete = createOAuthCallbackCompleter({ exchangeCode });
    await expect(complete('remotejobs44://auth-callback?code=retry')).resolves.toMatchObject({ status: 'error' });
    await expect(complete('remotejobs44://auth-callback?code=retry')).resolves.toEqual({ status: 'success' });
    expect(exchangeCode).toHaveBeenCalledTimes(2);
  });
});
