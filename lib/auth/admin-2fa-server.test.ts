import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateCode, hashCode, codesMatch, signSession, verifySession,
  CODE_LENGTH, SESSION_TTL_MS, MIN_ADMIN_2FA_SECRET_LENGTH,
} from './admin-2fa-server';

// A well-formed dedicated secret (>= MIN_ADMIN_2FA_SECRET_LENGTH chars).
const GOOD_SECRET = 'x'.repeat(MIN_ADMIN_2FA_SECRET_LENGTH + 16);
const ORIGINAL_SECRET = process.env.ADMIN_2FA_SECRET;
const ORIGINAL_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

function setSecret(v: string | undefined) {
  if (v === undefined) delete process.env.ADMIN_2FA_SECRET;
  else process.env.ADMIN_2FA_SECRET = v;
}

beforeEach(() => {
  // Prove the service-role key is NOT used as a fallback: keep it set to a
  // long value throughout, so any test that fails closed does so despite it.
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-'.repeat(4);
});
afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.ADMIN_2FA_SECRET;
  else process.env.ADMIN_2FA_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_SVC === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SVC;
});

describe('generateCode', () => {
  it('is always a zero-padded numeric string of CODE_LENGTH', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
      expect(c.length).toBe(CODE_LENGTH);
    }
  });
});

describe('hashCode / codesMatch', () => {
  it('binds the hash to the user id (same code, different user → no match)', () => {
    const h = hashCode('user-a', '048213');
    expect(codesMatch(h, 'user-a', '048213')).toBe(true);
    expect(codesMatch(h, 'user-b', '048213')).toBe(false);
  });

  it('trims whitespace on the submitted code', () => {
    const h = hashCode('user-a', '048213');
    expect(codesMatch(h, 'user-a', ' 048213 ')).toBe(true);
  });

  it('rejects a wrong code and tolerates length-mismatched garbage', () => {
    const h = hashCode('user-a', '048213');
    expect(codesMatch(h, 'user-a', '000000')).toBe(false);
    expect(codesMatch(h, 'user-a', 'nope')).toBe(false);
    expect(codesMatch('short', 'user-a', '048213')).toBe(false);
  });
});

describe('session sign/verify — happy path (secret configured)', () => {
  beforeEach(() => setSecret(GOOD_SECRET));

  it('round-trips a signed session for the same user', () => {
    const cookie = signSession('admin-1');
    expect(verifySession(cookie, 'admin-1')).toBe(true);
  });

  it('rejects a cookie for a different user (userId is bound into the sig)', () => {
    const cookie = signSession('admin-1');
    expect(verifySession(cookie, 'admin-2')).toBe(false);
  });

  it('rejects an expired cookie', () => {
    const t0 = 1_000_000_000_000;
    const cookie = signSession('admin-1', t0);
    // 1ms after expiry.
    expect(verifySession(cookie, 'admin-1', t0 + SESSION_TTL_MS + 1)).toBe(false);
    // still valid just before expiry.
    expect(verifySession(cookie, 'admin-1', t0 + SESSION_TTL_MS - 1)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const cookie = signSession('admin-1');
    const [uid, exp] = cookie.split('.');
    const forged = `${uid}.${exp}.${'0'.repeat(64)}`;
    expect(verifySession(forged, 'admin-1')).toBe(false);
  });

  it('rejects malformed cookies', () => {
    expect(verifySession('', 'admin-1')).toBe(false);
    expect(verifySession(undefined, 'admin-1')).toBe(false);
    expect(verifySession('a.b', 'admin-1')).toBe(false);
    expect(verifySession('a.b.c.d', 'admin-1')).toBe(false);
    expect(verifySession('admin-1.not-a-number.deadbeef', 'admin-1')).toBe(false);
  });
});

describe('FAIL CLOSED — secret missing or too short', () => {
  it('signSession throws when ADMIN_2FA_SECRET is unset', () => {
    setSecret(undefined);
    expect(() => signSession('admin-1')).toThrow(/ADMIN_2FA_SECRET/);
  });

  it('signSession throws when ADMIN_2FA_SECRET is too short', () => {
    setSecret('x'.repeat(MIN_ADMIN_2FA_SECRET_LENGTH - 1));
    expect(() => signSession('admin-1')).toThrow(/ADMIN_2FA_SECRET/);
  });

  it('verifySession returns false (never throws) when secret is unset', () => {
    // Sign with a good secret, then unset it — an unconfigured server must
    // reject a previously-valid cookie rather than crash.
    setSecret(GOOD_SECRET);
    const cookie = signSession('admin-1');
    setSecret(undefined);
    expect(verifySession(cookie, 'admin-1')).toBe(false);
  });

  it('verifySession returns false when secret is too short', () => {
    setSecret(GOOD_SECRET);
    const cookie = signSession('admin-1');
    setSecret('short');
    expect(verifySession(cookie, 'admin-1')).toBe(false);
  });

  it('does NOT fall back to SUPABASE_SERVICE_ROLE_KEY', () => {
    // Service-role key is set (see beforeEach) but ADMIN_2FA_SECRET is not:
    // signing must still fail closed, proving the key-reuse fallback is gone.
    setSecret(undefined);
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    expect(() => signSession('admin-1')).toThrow();
  });

  it('a cookie signed under a rotated secret does not verify under a new one', () => {
    setSecret(GOOD_SECRET);
    const cookie = signSession('admin-1');
    setSecret('y'.repeat(MIN_ADMIN_2FA_SECRET_LENGTH + 8));
    expect(verifySession(cookie, 'admin-1')).toBe(false);
  });
});
