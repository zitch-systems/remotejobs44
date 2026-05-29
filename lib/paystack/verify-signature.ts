// lib/paystack/verify-signature.ts
//
// Paystack webhook signature check, extracted from the route so it can
// be unit-tested. The route still owns the lifecycle (signature →
// event dedup → event-type handler); this module owns ONLY the
// cryptographic verification.
//
// Format: Paystack sends `x-paystack-signature` = lowercase hex
// SHA-512 HMAC of the raw request body, keyed on PAYSTACK_SECRET_KEY.
// We recompute and compare with timingSafeEqual.
import { createHmac, timingSafeEqual } from 'crypto';

export interface SignatureCheck {
  ok:     boolean;
  /**
   * Why a check failed — useful for log lines that distinguish
   * "Paystack misconfigured" (no signature header), "wrong format",
   * and "real tampering attempt" without ever echoing the signature
   * itself. Empty string when ok=true.
   */
  reason: '' | 'missing_signature' | 'length_mismatch' | 'invalid_hex' | 'mismatch';
}

export function verifyPaystackSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): SignatureCheck {
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };

  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');

  // Bail before timingSafeEqual on length mismatch — it throws on
  // different-length Buffers, which would surface as a 500 the attacker
  // could distinguish from a normal 401. Bailing here also rejects the
  // attacker probe of "send a 1-char signature to discover the length".
  if (signatureHeader.length !== expected.length) {
    return { ok: false, reason: 'length_mismatch' };
  }

  // Hex parse can throw on non-hex chars (Buffer.from is lenient but
  // produces a shorter buffer; we re-check length to catch that case).
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(signatureHeader, 'hex');
    expBuf = Buffer.from(expected,        'hex');
  } catch {
    return { ok: false, reason: 'invalid_hex' };
  }
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0) {
    return { ok: false, reason: 'invalid_hex' };
  }

  return timingSafeEqual(sigBuf, expBuf)
    ? { ok: true,  reason: '' }
    : { ok: false, reason: 'mismatch' };
}
