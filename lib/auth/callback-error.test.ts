import { describe, it, expect } from 'vitest';
import { describeAuthCallbackError } from './callback-error';

describe('describeAuthCallbackError', () => {
  it('returns null when there is no error code', () => {
    expect(describeAuthCallbackError(null)).toBeNull();
    expect(describeAuthCallbackError(undefined)).toBeNull();
    expect(describeAuthCallbackError('')).toBeNull();
  });

  it('explains a cancelled Google sign-in', () => {
    expect(describeAuthCallbackError('access_denied')).toMatch(/cancelled/i);
    expect(describeAuthCallbackError('auth_callback_failed', 'access_denied')).toMatch(/cancelled/i);
  });

  it('tells the user to use the same device when the code verifier is missing', () => {
    const msg = describeAuthCallbackError(
      'auth_callback_failed',
      'both auth code and code verifier should be non-empty',
    );
    expect(msg).toMatch(/same device/i);
  });

  it('explains an expired or already-used link', () => {
    expect(describeAuthCallbackError('auth_callback_failed', 'Email link is invalid or has expired')).toMatch(/expired|already used/i);
    expect(describeAuthCallbackError('auth_callback_failed', 'Token has expired or is invalid')).toMatch(/expired|already used/i);
  });

  it('handles the no_code / invalid flow-state case', () => {
    expect(describeAuthCallbackError('auth_callback_failed', 'no_code')).toMatch(/incomplete|already used|try again/i);
    expect(describeAuthCallbackError('auth_callback_failed', 'invalid flow state, no valid flow state found')).toMatch(/incomplete|already used|try again/i);
  });

  it('always returns an actionable string for a generic callback failure', () => {
    const msg = describeAuthCallbackError('auth_callback_failed', 'some unexpected server message');
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/sign-in/i);
    // Never leak the raw slug.
    expect(msg).not.toBe('auth_callback_failed');
  });

  it('handles other provider error codes', () => {
    expect(describeAuthCallbackError('server_error')).toMatch(/try again/i);
    expect(describeAuthCallbackError('temporarily_unavailable')).toMatch(/try again/i);
  });
});
