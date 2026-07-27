import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isUnsubscribeTopic,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
  unsubscribeHeaders,
} from './unsubscribe';

const ORIGINAL = process.env.EMAIL_UNSUBSCRIBE_SECRET;
const USER = '3f7c1e9a-0000-4000-8000-000000000001';

beforeEach(() => { process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-value'; });
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  else process.env.EMAIL_UNSUBSCRIBE_SECRET = ORIGINAL;
});

describe('isUnsubscribeTopic', () => {
  it('accepts the opt-out-able topics', () => {
    expect(isUnsubscribeTopic('marketing')).toBe(true);
    expect(isUnsubscribeTopic('job_alerts')).toBe(true);
    expect(isUnsubscribeTopic('product_updates')).toBe(true);
  });

  it('rejects billing — receipts and dunning are transactional, not opt-out', () => {
    expect(isUnsubscribeTopic('billing')).toBe(false);
  });

  it('rejects unknown values and non-strings', () => {
    expect(isUnsubscribeTopic('everything')).toBe(false);
    expect(isUnsubscribeTopic('')).toBe(false);
    expect(isUnsubscribeTopic(null)).toBe(false);
    expect(isUnsubscribeTopic(42)).toBe(false);
  });
});

describe('token round-trip', () => {
  it('verifies a token it just issued', () => {
    const token = unsubscribeToken(USER, 'job_alerts');
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(USER, 'job_alerts', token)).toBe(true);
  });

  it('is bound to the user — one recipient cannot unsubscribe another', () => {
    const token = unsubscribeToken(USER, 'job_alerts');
    expect(verifyUnsubscribeToken('3f7c1e9a-0000-4000-8000-000000000002', 'job_alerts', token)).toBe(false);
  });

  it('is bound to the topic — a job-alert link cannot kill marketing mail', () => {
    const token = unsubscribeToken(USER, 'job_alerts');
    expect(verifyUnsubscribeToken(USER, 'marketing', token)).toBe(false);
  });

  it('rejects a tampered, empty, or missing signature', () => {
    const token = unsubscribeToken(USER, 'marketing')!;
    expect(verifyUnsubscribeToken(USER, 'marketing', token.slice(0, -1) + 'X')).toBe(false);
    expect(verifyUnsubscribeToken(USER, 'marketing', '')).toBe(false);
    expect(verifyUnsubscribeToken(USER, 'marketing', null)).toBe(false);
    // A length mismatch must return false, not throw out of timingSafeEqual.
    expect(verifyUnsubscribeToken(USER, 'marketing', 'short')).toBe(false);
  });

  it('rejects a valid signature carried on a non-opt-out topic', () => {
    const token = unsubscribeToken(USER, 'marketing');
    expect(verifyUnsubscribeToken(USER, 'billing', token)).toBe(false);
  });

  it('does not verify once the signing key changes', () => {
    const token = unsubscribeToken(USER, 'marketing');
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'a-different-secret';
    expect(verifyUnsubscribeToken(USER, 'marketing', token)).toBe(false);
  });
});

describe('unsubscribeUrl', () => {
  it('carries user, topic and signature as query params', () => {
    const url = new URL(unsubscribeUrl(USER, 'job_alerts')!);
    expect(url.pathname).toBe('/api/email/unsubscribe');
    expect(url.searchParams.get('u')).toBe(USER);
    expect(url.searchParams.get('t')).toBe('job_alerts');
    expect(verifyUnsubscribeToken(USER, 'job_alerts', url.searchParams.get('s'))).toBe(true);
  });
});

describe('unsubscribeHeaders', () => {
  it('emits both RFC 8058 headers so Gmail shows its native control', () => {
    const h = unsubscribeHeaders(USER, 'marketing');
    expect(h['List-Unsubscribe']).toMatch(/^<https?:\/\/.+>$/);
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('returns an empty object when no signing key is configured, so spreading it is safe', () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(unsubscribeHeaders(USER, 'marketing')).toEqual({});
      expect(unsubscribeUrl(USER, 'marketing')).toBeNull();
      expect(unsubscribeToken(USER, 'marketing')).toBeNull();
    } finally {
      if (prevServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey;
    }
  });
});
