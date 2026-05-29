import { describe, it, expect } from 'vitest';
import {
  IS_SB_AUTH_COOKIE_NAME,
  SB_AUTH_COOKIE_IN_DOCUMENT,
  hasSupabaseAuthCookie,
} from './cookies';

// These tests pin the cookie regex that gates the middleware's
// "user has no session, bounce to /login" decision and the
// AuthSyncProvider's "session expired, clear Zustand" decision. A
// regression here is what historically caused the random-logout bug —
// chunked sessions (long Google-OAuth JWTs) live under names like
// `sb-<ref>-auth-token.0`, `…1`, …, with the base name deleted. A
// previous `endsWith('-auth-token')` missed those entirely.

describe('IS_SB_AUTH_COOKIE_NAME (cookie-name match)', () => {
  describe('matches valid Supabase auth cookie names', () => {
    it.each([
      ['sb-abcdefg-auth-token'],
      ['sb-abcdefg-auth-token.0'],
      ['sb-abcdefg-auth-token.1'],
      ['sb-abcdefg-auth-token.42'],
      ['sb-abcdefg-auth-token.999'],
      // Real Supabase project refs are 20 chars; the pattern doesn't
      // care about length so anything between `sb-` and `-auth-token`
      // is acceptable.
      ['sb-gnyilmahiyddplsrrhoq-auth-token'],
      ['sb-gnyilmahiyddplsrrhoq-auth-token.0'],
    ])('matches %s', (name) => {
      expect(IS_SB_AUTH_COOKIE_NAME.test(name)).toBe(true);
    });
  });

  describe('rejects look-alike names', () => {
    it.each([
      // Chunk suffix must be all digits — `.foo` is not a chunk.
      ['sb-abcdefg-auth-token.foo'],
      ['sb-abcdefg-auth-token.0a'],
      ['sb-abcdefg-auth-token.'],
      // Anchored — extra trailing/leading content disqualifies.
      ['sb-abcdefg-auth-tokenfoo'],
      ['foosb-abcdefg-auth-token'],
      // Missing project-ref segment.
      ['sb--auth-token'],
      // Wrong prefix.
      ['s-abcdefg-auth-token'],
      ['x-abcdefg-auth-token'],
      // Unrelated cookies that should never trip the gate.
      ['session'],
      ['authjs.session-token'],
      [''],
    ])('does not match %s', (name) => {
      expect(IS_SB_AUTH_COOKIE_NAME.test(name)).toBe(false);
    });
  });
});

describe('SB_AUTH_COOKIE_IN_DOCUMENT (document.cookie scan)', () => {
  describe('matches when an sb auth cookie is in the cookie header', () => {
    it.each([
      ['sb-abcdefg-auth-token=eyJhbGciOiJIUzI1NiJ9.xxxx'],
      ['other=1; sb-abcdefg-auth-token=eyJ...'],
      ['sb-abcdefg-auth-token.0=eyJ...; sb-abcdefg-auth-token.1=eyK...'],
      ['theme=dark; sb-abcdefg-auth-token.0=eyJ...; locale=en'],
    ])('matches in %s', (cookieHeader) => {
      expect(SB_AUTH_COOKIE_IN_DOCUMENT.test(cookieHeader)).toBe(true);
    });
  });

  describe('does NOT match when only a value contains the substring', () => {
    // The classic over-match: a free-text cookie value that happens to
    // contain "sb-foo-auth-token". The `(?:^|;\s*)` and `[^=]+` together
    // mean the pattern only fires at the START of a cookie name.
    it.each([
      ['unrelated=sb-evil-auth-token-value'],
      ['x=sb-foo-auth-token'],
    ])('does not match in %s', (cookieHeader) => {
      expect(SB_AUTH_COOKIE_IN_DOCUMENT.test(cookieHeader)).toBe(false);
    });
  });

  it('does not match an empty / unrelated cookie header', () => {
    expect(SB_AUTH_COOKIE_IN_DOCUMENT.test('')).toBe(false);
    expect(SB_AUTH_COOKIE_IN_DOCUMENT.test('theme=dark; locale=en')).toBe(false);
  });
});

describe('hasSupabaseAuthCookie', () => {
  it('returns true when any cookie in the list is an auth cookie', () => {
    expect(hasSupabaseAuthCookie([
      { name: 'theme' },
      { name: 'sb-abcdefg-auth-token.0' },
    ])).toBe(true);
  });

  it('returns false when no auth cookie is present', () => {
    expect(hasSupabaseAuthCookie([
      { name: 'theme' },
      { name: 'locale' },
    ])).toBe(false);
  });

  it('returns false on an empty list', () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
  });

  it('matches chunked AND non-chunked names', () => {
    expect(hasSupabaseAuthCookie([{ name: 'sb-x-auth-token' }])).toBe(true);
    expect(hasSupabaseAuthCookie([{ name: 'sb-x-auth-token.0' }])).toBe(true);
    expect(hasSupabaseAuthCookie([{ name: 'sb-x-auth-token.99' }])).toBe(true);
  });
});
