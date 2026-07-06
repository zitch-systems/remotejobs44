// lib/auth/recovery-route.test.ts
import { describe, it, expect } from 'vitest';
import { isRecoveryRoute } from './recovery-route';

describe('isRecoveryRoute', () => {
  it('matches the exact recovery route', () => {
    expect(isRecoveryRoute('/reset-password')).toBe(true);
  });

  it('matches a trailing slash', () => {
    expect(isRecoveryRoute('/reset-password/')).toBe(true);
  });

  it('matches a sub-path', () => {
    expect(isRecoveryRoute('/reset-password/step-2')).toBe(true);
  });

  it('ignores a query string (recovery links carry ?code=)', () => {
    expect(isRecoveryRoute('/reset-password?code=abc123')).toBe(true);
  });

  it('ignores a hash fragment (implicit-flow recovery tokens)', () => {
    expect(isRecoveryRoute('/reset-password#access_token=x&type=recovery')).toBe(true);
  });

  it('does NOT match unrelated routes', () => {
    expect(isRecoveryRoute('/')).toBe(false);
    expect(isRecoveryRoute('/login')).toBe(false);
    expect(isRecoveryRoute('/dashboard')).toBe(false);
    expect(isRecoveryRoute('/jobs')).toBe(false);
  });

  it('does NOT match a route that merely starts with the same letters', () => {
    // guards against a naive startsWith('/reset-password') that would also
    // swallow e.g. /reset-password-help
    expect(isRecoveryRoute('/reset-password-help')).toBe(false);
    expect(isRecoveryRoute('/reset-passwords')).toBe(false);
  });

  it('does NOT match the admin-triggered reset API path', () => {
    // app/api/admin/users/[id]/reset-password — server route, never the
    // client recovery page; must not be exempted.
    expect(isRecoveryRoute('/api/admin/users/42/reset-password')).toBe(false);
  });

  it('is safe on null / undefined / empty input', () => {
    expect(isRecoveryRoute(null)).toBe(false);
    expect(isRecoveryRoute(undefined)).toBe(false);
    expect(isRecoveryRoute('')).toBe(false);
  });
});
