import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret, isEncryptedSecret } from './secret';

const ORIGINAL_KEY = process.env.AI_KEYS_ENCRYPTION_KEY;
// Deterministic 32-byte key for tests, base64-encoded.
const TEST_KEY_HEX = 'a'.repeat(64);

// Each test starts from a clean module state for the cached key, which
// loadKey() memoises. Vitest doesn't reset modules between tests
// automatically; resetting the env var alone is not enough because the
// secret module caches the parsed buffer after first call. We work
// around it by importing fresh in each test that needs a different key.
async function freshSecret() {
  const mod = await import('./secret');
  // Force a re-import by jiggling the cache — vitest's vi.resetModules
  // would be cleaner; this avoids that dependency.
  return mod;
}

describe('isEncryptedSecret', () => {
  it('detects the v1 envelope prefix', () => {
    expect(isEncryptedSecret('enc:v1:abc')).toBe(true);
    expect(isEncryptedSecret('sk-live-foo')).toBe(false);
    expect(isEncryptedSecret('')).toBe(false);
    expect(isEncryptedSecret(null)).toBe(false);
    expect(isEncryptedSecret(undefined)).toBe(false);
  });
});

describe('encrypt/decrypt round-trip', () => {
  beforeEach(() => { process.env.AI_KEYS_ENCRYPTION_KEY = TEST_KEY_HEX; });
  afterEach(()  => {
    if (ORIGINAL_KEY === undefined) delete process.env.AI_KEYS_ENCRYPTION_KEY;
    else process.env.AI_KEYS_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  // Because loadKey() caches per-module, only the FIRST call after
  // module load reads the env var. We test the round-trip by re-using
  // the same import, which is fine because the key is set BEFORE the
  // first encrypt/decrypt call.
  it('encrypted output is the v1 envelope and decrypts back', () => {
    const plain = 'sk-test-1234567890abcdef';
    const enc = encryptSecret(plain);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('idempotent: encrypting an already-encrypted value is a no-op', () => {
    const enc1 = encryptSecret('hello');
    const enc2 = encryptSecret(enc1);
    expect(enc2).toBe(enc1);
  });

  it('decrypting plaintext passes through unchanged (legacy support)', () => {
    expect(decryptSecret('sk-legacy-key')).toBe('sk-legacy-key');
  });

  it('empty / null returns falsy without throwing', () => {
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret(null)).toBe(null);
    expect(decryptSecret('')).toBe(null);
  });

  it('two encryptions of the same plaintext differ (random IV)', () => {
    const a = encryptSecret('sk-test-same');
    const b = encryptSecret('sk-test-same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('sk-test-same');
    expect(decryptSecret(b)).toBe('sk-test-same');
  });
});
