import { describe, it, expect } from 'vitest';
import { extractPaystackId } from './event-id';

describe('extractPaystackId', () => {
  it('picks reference for charge.success', () => {
    expect(extractPaystackId({
      event: 'charge.success',
      data:  { reference: 'TXN_abc123', id: 12345 },
    })).toBe('TXN_abc123');
  });

  it('falls back to invoice_code when reference is absent', () => {
    expect(extractPaystackId({
      event: 'invoice.create',
      data:  { invoice_code: 'INV_xyz', id: 99 },
    })).toBe('INV_xyz');
  });

  it('picks nested subscription_code for invoice.payment_failed', () => {
    expect(extractPaystackId({
      event: 'invoice.payment_failed',
      data:  { subscription: { subscription_code: 'SUB_nested' } },
    })).toBe('SUB_nested');
  });

  it('falls back to top-level subscription_code for subscription.disable', () => {
    expect(extractPaystackId({
      event: 'subscription.disable',
      data:  { subscription_code: 'SUB_top' },
    })).toBe('SUB_top');
  });

  it('stringifies numeric data.id as last resort', () => {
    expect(extractPaystackId({
      event: 'something.weird',
      data:  { id: 42 },
    })).toBe('42');
  });

  it('handles string data.id', () => {
    expect(extractPaystackId({
      event: 'weird',
      data:  { id: 'string-id-42' },
    })).toBe('string-id-42');
  });

  it('returns null when no identifier is present', () => {
    expect(extractPaystackId({ event: 'something', data: {} })).toBeNull();
    expect(extractPaystackId({ event: 'something' })).toBeNull();
    expect(extractPaystackId({})).toBeNull();
  });

  it('skips empty strings in favour of later candidates', () => {
    // Paystack sometimes ships empty-string fields for the slot that
    // isn't relevant to a given event type. The empty string must not
    // be picked as the dedup key.
    expect(extractPaystackId({
      event: 'charge.success',
      data:  { reference: '', invoice_code: 'INV_real' },
    })).toBe('INV_real');
  });

  it('priority order: reference > invoice_code > nested sub > top sub > id', () => {
    expect(extractPaystackId({
      event: 'mixed',
      data:  {
        reference:         'r',
        invoice_code:      'i',
        subscription:      { subscription_code: 'ns' },
        subscription_code: 's',
        id:                999,
      },
    })).toBe('r');
    expect(extractPaystackId({
      event: 'mixed',
      data:  {
        invoice_code:      'i',
        subscription:      { subscription_code: 'ns' },
        subscription_code: 's',
        id:                999,
      },
    })).toBe('i');
    expect(extractPaystackId({
      event: 'mixed',
      data:  {
        subscription:      { subscription_code: 'ns' },
        subscription_code: 's',
        id:                999,
      },
    })).toBe('ns');
    expect(extractPaystackId({
      event: 'mixed',
      data:  {
        subscription_code: 's',
        id:                999,
      },
    })).toBe('s');
  });
});
