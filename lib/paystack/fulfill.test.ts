import { describe, expect, it, vi } from 'vitest';
import { fulfillPaystackCharge, paymentPlanFromMetadata } from './fulfill';

function dbWithRpc(result: { data?: unknown; error?: unknown } = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  return { db: { rpc } as any, rpc };
}

describe('paymentPlanFromMetadata', () => {
  it('normalizes the mobile annual selection', () => {
    expect(paymentPlanFromMetadata({ selection: 'annual' })).toBe('pro_annual');
  });

  it('accepts valid selection/plan values and rejects unknown metadata', () => {
    expect(paymentPlanFromMetadata({ selection: 'daily', plan: 'pro' })).toBe('daily');
    expect(paymentPlanFromMetadata({ plan: 'pro_annual' })).toBe('pro_annual');
    expect(paymentPlanFromMetadata({ selection: 'enterprise', plan: 'enterprise' })).toBeNull();
    expect(paymentPlanFromMetadata(null)).toBeNull();
  });
});

describe('fulfillPaystackCharge', () => {
  it('rejects an invalid amount locally without invoking the RPC', async () => {
    const { db, rpc } = dbWithRpc();
    await expect(fulfillPaystackCharge(db, {
      reference: 'bad_amount',
      userId: '11111111-1111-4111-8111-111111111111',
      plan: 'pro',
      amount: 50000,
      currency: 'NGN',
    })).rejects.toThrow('Payment amount mismatch');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the complete verified charge to the atomic RPC', async () => {
    const response = { credited: true, plan: 'pro', expires_at: '2030-01-01T00:00:00Z' };
    const { db, rpc } = dbWithRpc({ data: response });
    await expect(fulfillPaystackCharge(db, {
      reference: 'pay_1',
      userId: '11111111-1111-4111-8111-111111111111',
      plan: 'pro_annual',
      amount: 2999900,
      currency: 'NGN',
      customerCode: 'CUS_1',
      subscriptionCode: 'SUB_1',
      emailToken: 'EMAIL_1',
    })).resolves.toEqual(response);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('fulfill_paystack_charge', {
      p_reference: 'pay_1',
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_selection: 'pro_annual',
      p_amount: 2999900,
      p_currency: 'NGN',
      p_customer_code: 'CUS_1',
      p_subscription_code: 'SUB_1',
      p_email_token: 'EMAIL_1',
    });
  });

  it('fails closed on an RPC error instead of attempting partial writes', async () => {
    const { db, rpc } = dbWithRpc({ error: { message: 'constraint failed' } });
    await expect(fulfillPaystackCharge(db, {
      reference: 'pay_error',
      userId: '11111111-1111-4111-8111-111111111111',
      plan: 'daily',
      amount: 50000,
      currency: 'NGN',
    })).rejects.toThrow('Payment fulfillment failed: constraint failed');
    expect(rpc).toHaveBeenCalledOnce();
    expect(Object.keys(db)).toEqual(['rpc']);
  });

  it('rejects malformed success data', async () => {
    const { db } = dbWithRpc({ data: { plan: 'pro' } });
    await expect(fulfillPaystackCharge(db, {
      reference: 'pay_bad_response',
      userId: '11111111-1111-4111-8111-111111111111',
      plan: 'pro',
      amount: 299900,
      currency: 'NGN',
    })).rejects.toThrow('Invalid payment fulfillment result');
  });
});
