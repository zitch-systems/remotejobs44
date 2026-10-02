export interface AuthCallbackParams {
  code?: string;
  tokenHash?: string;
  type?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export type RecoveryCallback =
  | { kind: 'code'; code: string }
  | { kind: 'otp'; tokenHash: string }
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'error' }
  | { kind: 'invalid' };

/** Parse Supabase callback values from either the query string or URL fragment. */
export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  try {
    const parsed = new URL(url);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const value = (key: string) => parsed.searchParams.get(key) ?? fragment.get(key) ?? undefined;
    return {
      code: value('code'),
      tokenHash: value('token_hash'),
      type: value('type'),
      accessToken: value('access_token'),
      refreshToken: value('refresh_token'),
      error: value('error_description') ?? value('error') ?? value('error_code'),
    };
  } catch {
    return { error: 'invalid_callback_url' };
  }
}

/** Accept only callback shapes that can establish a password-recovery session. */
export function recoveryCallback(params: AuthCallbackParams): RecoveryCallback {
  if (params.error) return { kind: 'error' };
  if (params.code) return { kind: 'code', code: params.code };
  if (params.type !== 'recovery') return { kind: 'invalid' };
  if (params.tokenHash) return { kind: 'otp', tokenHash: params.tokenHash };
  if (params.accessToken && params.refreshToken) {
    return { kind: 'session', accessToken: params.accessToken, refreshToken: params.refreshToken };
  }
  return { kind: 'invalid' };
}
