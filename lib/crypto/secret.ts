// lib/crypto/secret.ts
// Symmetric envelope encryption for at-rest secrets — used by the AI
// provider config table so a DB dump alone (no service-role key, no env
// access) cannot recover Claude / OpenAI / Gemini API keys.
//
// Format on the wire / in the DB:
//   enc:v1:<base64url(iv ‖ ciphertext ‖ authTag)>
//
// where iv is 12 bytes, authTag is 16 bytes, ciphertext is variable
// length. AES-256-GCM provides confidentiality + integrity in one pass.
//
// Key handling:
//   * AI_KEYS_ENCRYPTION_KEY must be 32 bytes, base64 or hex encoded.
//   * Without the env var, encrypt() returns the plaintext unchanged
//     (logged via console.warn so ops notice) — this lets existing
//     deploys keep working, and lets a re-key be done lazily.
//   * decrypt() with no env var on a value that already starts with
//     `enc:v1:` throws — fail closed; you'd be silently handing the
//     UI a useless string otherwise.
//
// Legacy plaintext rows: decrypt() is a no-op when the value has no
// `enc:v1:` prefix, so the same column can hold both shapes during
// transition. Each save through admin UI re-writes the row in the new
// shape.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';
const IV_LEN  = 12;  // 96 bits — recommended for GCM
const TAG_LEN = 16;  // 128 bits

function loadKey(): Buffer | null {
  const raw = process.env.AI_KEYS_ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept either hex (64 chars) or base64 (44 chars w/ padding).
  // Strip whitespace defensively — pasting the env value via Vercel UI
  // occasionally lands a stray newline.
  const cleaned = raw.replace(/\s+/g, '');
  if (/^[0-9a-f]{64}$/i.test(cleaned)) {
    return Buffer.from(cleaned, 'hex');
  }
  const buf = Buffer.from(cleaned, 'base64');
  if (buf.length === 32) return buf;
  // Misconfigured — better to surface a clear error than silently
  // operate with a weak/wrong key.
  throw new Error('AI_KEYS_ENCRYPTION_KEY must decode to 32 bytes (hex or base64).');
}

let cachedKey: Buffer | null | undefined;
function getKey(): Buffer | null {
  if (cachedKey === undefined) cachedKey = loadKey();
  return cachedKey;
}

/** True if the value is in the v1 ciphertext envelope. */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a plaintext secret. Returns the `enc:v1:…` envelope when a
 * key is configured; returns the plaintext unchanged otherwise (with a
 * one-time warning per process so ops can spot the missing env var).
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (isEncryptedSecret(plaintext)) return plaintext; // already wrapped
  const key = getKey();
  if (!key) {
    warnMissingKey();
    return plaintext;
  }
  const iv     = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  const combined = Buffer.concat([iv, ct, tag]);
  return PREFIX + combined.toString('base64');
}

/**
 * Decrypt a `enc:v1:…` envelope; returns plaintext as-is when the value
 * isn't wrapped. Throws when a wrapped value is present but no key is
 * configured (fail closed — silent partial-decrypt would surface
 * unusable strings to the AI client).
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncryptedSecret(stored)) return stored; // legacy plaintext
  const key = getKey();
  if (!key) {
    throw new Error('AI_KEYS_ENCRYPTION_KEY required to decrypt stored secret.');
  }
  const combined = Buffer.from(stored.slice(PREFIX.length), 'base64');
  if (combined.length <= IV_LEN + TAG_LEN) {
    throw new Error('Corrupt encrypted secret: too short.');
  }
  const iv  = combined.subarray(0, IV_LEN);
  const tag = combined.subarray(combined.length - TAG_LEN);
  const ct  = combined.subarray(IV_LEN, combined.length - TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

let warned = false;
function warnMissingKey() {
  if (warned) return;
  warned = true;
  // logEvent isn't available here without circular deps; the route layer
  // logs the broader operation, so a plain warn is fine for ops triage.
  console.warn('[crypto/secret] AI_KEYS_ENCRYPTION_KEY missing — secrets stored as plaintext.');
}
