import { parseAuthCallbackUrl, recoveryCallback, routeOAuthCallbackUrl } from './auth-callback';

describe('parseAuthCallbackUrl', () => {
  it('reads a PKCE code from the query string', () => {
    expect(parseAuthCallbackUrl('remotejobs44://reset-password?code=a%2Bb').code).toBe('a+b');
  });

  it('reads token-hash callbacks and errors from fragments', () => {
    expect(parseAuthCallbackUrl('remotejobs44://reset-password#token_hash=abc&type=recovery')).toEqual({
      code: undefined,
      tokenHash: 'abc',
      type: 'recovery',
      accessToken: undefined,
      refreshToken: undefined,
      error: undefined,
    });
    expect(parseAuthCallbackUrl('remotejobs44://reset-password#error=access_denied&error_description=Expired').error).toBe('Expired');
  });

  it('accepts only recovery OTPs and recovery fragment sessions', () => {
    expect(recoveryCallback(parseAuthCallbackUrl('remotejobs44://reset-password?token_hash=abc&type=signup'))).toEqual({ kind: 'invalid' });
    expect(recoveryCallback(parseAuthCallbackUrl('remotejobs44://reset-password#type=recovery&access_token=access&refresh_token=refresh'))).toEqual({
      kind: 'session',
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(recoveryCallback(parseAuthCallbackUrl('remotejobs44://reset-password#type=recovery&access_token=access'))).toEqual({ kind: 'invalid' });
  });

  it('fails closed for malformed callback URLs', () => {
    expect(parseAuthCallbackUrl('not a URL')).toEqual({ error: 'invalid_callback_url' });
  });
});

describe('warm-launch OAuth route parameters', () => {
  it('preserves encoded PKCE codes after Linking consumes the callback URL', () => {
    const url = routeOAuthCallbackUrl({ code: 'a+b/c?&=' });
    expect(parseAuthCallbackUrl(url!).code).toBe('a+b/c?&=');
  });
  it('preserves provider errors and accepts router array parameters', () => {
    const url = routeOAuthCallbackUrl({ code: ['first', 'second'], error_description: 'Access denied' });
    expect(parseAuthCallbackUrl(url!)).toMatchObject({ code: 'first', error: 'Access denied' });
  });
  it('does not invent a callback from unrelated or empty route parameters', () => {
    expect(routeOAuthCallbackUrl({ other: 'value', code: '' })).toBeNull();
  });
});
