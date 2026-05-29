import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyPaystackSignature } from './verify-signature';

const SECRET = 'sk_test_paystack_secret';
const BODY   = JSON.stringify({ event: 'charge.success', data: { reference: 'abc' } });
const VALID  = createHmac('sha512', SECRET).update(BODY).digest('hex');

describe('verifyPaystackSignature', () => {
  it('accepts a correct SHA-512 HMAC', () => {
    expect(verifyPaystackSignature(BODY, VALID, SECRET)).toEqual({ ok: true, reason: '' });
  });

  it('rejects a tampered body', () => {
    const tampered = BODY.replace('charge.success', 'charge.fake');
    expect(verifyPaystackSignature(tampered, VALID, SECRET).ok).toBe(false);
  });

  it('rejects when the wrong secret is used', () => {
    const wrongSig = createHmac('sha512', 'sk_other').update(BODY).digest('hex');
    const out = verifyPaystackSignature(BODY, wrongSig, SECRET);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('mismatch');
  });

  it('returns missing_signature when header absent', () => {
    expect(verifyPaystackSignature(BODY, null, SECRET).reason).toBe('missing_signature');
    expect(verifyPaystackSignature(BODY, undefined, SECRET).reason).toBe('missing_signature');
    expect(verifyPaystackSignature(BODY, '', SECRET).reason).toBe('missing_signature');
  });

  it('returns length_mismatch (not 500) on attacker probe with short signature', () => {
    // This pattern previously could throw inside timingSafeEqual and
    // become a 500 — distinguishable from the normal 401 the attacker
    // sees for "wrong secret", and therefore a length oracle.
    const out = verifyPaystackSignature(BODY, 'short', SECRET);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('length_mismatch');
  });

  it('rejects non-hex characters in a same-length string', () => {
    const garbage = 'z'.repeat(VALID.length);
    const out = verifyPaystackSignature(BODY, garbage, SECRET);
    expect(out.ok).toBe(false);
    // Either invalid_hex (Buffer.from filtered chars out) or mismatch
    // (decoded into zeros that don't equal expected) — both are correct
    // negatives. The point is no exception escapes.
    expect(['invalid_hex', 'mismatch']).toContain(out.reason);
  });

  it('treats empty body + valid signature for empty body as ok', () => {
    // Paystack does send small-body events sometimes (heartbeats); this
    // confirms we don't accidentally short-circuit on body length.
    const sigForEmpty = createHmac('sha512', SECRET).update('').digest('hex');
    expect(verifyPaystackSignature('', sigForEmpty, SECRET).ok).toBe(true);
  });

  it('handles same-length tampered hex without throwing', () => {
    // Flip one hex character → still valid hex, same length. Should
    // cleanly return mismatch.
    const flipped = VALID[0] === '0' ? '1' + VALID.slice(1) : '0' + VALID.slice(1);
    const out = verifyPaystackSignature(BODY, flipped, SECRET);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('mismatch');
  });
});
