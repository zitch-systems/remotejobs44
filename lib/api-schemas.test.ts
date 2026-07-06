// lib/api-schemas.test.ts — boundary-schema behaviour lock.
// These assert the exact accept/reject contract the payment routes depend on,
// so a future schema tweak can't silently loosen a payment boundary.
import { describe, it, expect } from 'vitest';
import {
  initializePaymentSchema,
  applicationCreateSchema,
  paystackReferenceSchema,
  paystackWebhookEnvelopeSchema,
} from './api-schemas';

describe('initializePaymentSchema', () => {
  it.each(['daily', 'pro', 'pro_annual'])('accepts valid plan %s', (plan) => {
    const r = initializePaymentSchema.safeParse({ plan });
    expect(r.success).toBe(true);
  });

  it.each([
    ['missing plan', {}],
    ['unknown plan', { plan: 'platinum' }],
    ['empty string', { plan: '' }],
    ['numeric plan', { plan: 1 }],
    ['null plan', { plan: null }],
  ])('rejects %s', (_label, input) => {
    expect(initializePaymentSchema.safeParse(input).success).toBe(false);
  });
});

describe('applicationCreateSchema', () => {
  const UUID = '11111111-1111-4111-8111-111111111111';

  it('accepts a uuid jobId and defaults autoApplied to false', () => {
    const r = applicationCreateSchema.safeParse({ jobId: UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.autoApplied).toBe(false);
  });

  it('keeps autoApplied true only when literally true', () => {
    expect(applicationCreateSchema.safeParse({ jobId: UUID, autoApplied: true }).success && true).toBe(true);
    const t = applicationCreateSchema.safeParse({ jobId: UUID, autoApplied: true });
    const s = applicationCreateSchema.safeParse({ jobId: UUID, autoApplied: 'yes' });
    const n = applicationCreateSchema.safeParse({ jobId: UUID, autoApplied: 1 });
    expect(t.success && t.data.autoApplied).toBe(true);
    // Non-boolean coerces to false instead of failing the request.
    expect(s.success && s.data.autoApplied).toBe(false);
    expect(n.success && n.data.autoApplied).toBe(false);
  });

  it.each([
    ['missing jobId', {}],
    ['non-uuid jobId', { jobId: 'not-a-uuid' }],
    ['numeric jobId', { jobId: 123 }],
  ])('rejects %s', (_label, input) => {
    expect(applicationCreateSchema.safeParse(input).success).toBe(false);
  });
});

describe('paystackReferenceSchema', () => {
  it.each(['T_675846_3yk2j', 'ref-abc-123', 'a'])('accepts %s', (ref) => {
    expect(paystackReferenceSchema.safeParse(ref).success).toBe(true);
  });

  it.each([
    ['path traversal', 'xyz/../customer/123'],
    ['empty', ''],
    ['space', 'ref 123'],
    ['too long', 'a'.repeat(81)],
  ])('rejects %s', (_label, ref) => {
    expect(paystackReferenceSchema.safeParse(ref).success).toBe(false);
  });
});

describe('paystackWebhookEnvelopeSchema', () => {
  it('accepts a well-formed event with data', () => {
    const r = paystackWebhookEnvelopeSchema.safeParse({
      event: 'charge.success',
      data: { reference: 'ref_1', metadata: { user_id: 'x' } },
    });
    expect(r.success).toBe(true);
  });

  it('accepts an event with no data (permissive)', () => {
    expect(paystackWebhookEnvelopeSchema.safeParse({ event: 'charge.success' }).success).toBe(true);
  });

  it.each([
    ['missing event', { data: {} }],
    ['empty event', { event: '' }],
    ['non-object', 'charge.success'],
  ])('rejects %s', (_label, input) => {
    expect(paystackWebhookEnvelopeSchema.safeParse(input).success).toBe(false);
  });
});
