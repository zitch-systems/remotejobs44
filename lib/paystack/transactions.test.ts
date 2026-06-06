import { describe, it, expect } from 'vitest';
import { mapPaystackTransaction } from './transactions';

// Pins the pure mapping behind the admin Payments page. Paystack amounts are
// in kobo (minor units), customer names come split across first/last, and the
// plan/user_id live in checkout metadata that isn't always present — all easy
// places to ship a silent display bug.
describe('mapPaystackTransaction', () => {
  it('maps a typical successful charge to display fields (kobo → naira)', () => {
    const rec = mapPaystackTransaction({
      reference: 'ref_123',
      amount:    250000,                 // kobo → ₦2,500
      currency:  'NGN',
      status:    'success',
      channel:   'card',
      paid_at:   '2026-05-01T10:00:00Z',
      customer:  { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
      metadata:  { plan: 'pro_monthly', user_id: 'u-1' },
    });
    expect(rec).toEqual({
      reference:     'ref_123',
      paidAt:        '2026-05-01T10:00:00Z',
      amount:        2500,
      currency:      'NGN',
      plan:          'pro_monthly',
      userId:        'u-1',
      customerName:  'Ada Lovelace',
      customerEmail: 'ada@example.com',
      channel:       'card',
      status:        'success',
    });
  });

  it('tolerates missing metadata / customer name / amount', () => {
    const rec = mapPaystackTransaction({ reference: 'r', currency: 'NGN', customer: { email: 'x@y.com' } });
    expect(rec.plan).toBeNull();
    expect(rec.userId).toBeNull();
    expect(rec.customerName).toBeNull();   // no first/last name → null, not ''
    expect(rec.customerEmail).toBe('x@y.com');
    expect(rec.amount).toBe(0);            // missing amount → 0, never NaN
  });

  it('builds the name from whichever of first/last name is present', () => {
    expect(mapPaystackTransaction({ customer: { first_name: 'Grace' } }).customerName).toBe('Grace');
    expect(mapPaystackTransaction({ customer: { last_name: 'Hopper' } }).customerName).toBe('Hopper');
  });

  it('falls back to created_at when paid_at is absent', () => {
    expect(mapPaystackTransaction({ created_at: '2026-01-02T00:00:00Z' }).paidAt).toBe('2026-01-02T00:00:00Z');
  });

  it('never returns NaN for a non-number amount', () => {
    expect(mapPaystackTransaction({ amount: '250000' as unknown as number }).amount).toBe(0);
    expect(mapPaystackTransaction({}).amount).toBe(0);
  });
});
