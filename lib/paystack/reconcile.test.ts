import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const originalSecret = process.env.PAYSTACK_SECRET_KEY;
let subscriptionResult: unknown = null;

vi.mock('@/lib/paystack/subscription', () => ({
  fetchActiveSubscriptionForCustomer: async () => subscriptionResult,
}));
vi.mock('@/lib/log', () => ({ logInfo: () => {}, logWarn: () => {}, logError: () => {} }));

async function loadReconcile(secret?: string) {
  vi.resetModules();
  if (secret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = secret;
  return (await import('./reconcile')).reconcilePaystackCharges;
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    reference: 'reconcile_ref',
    amount: 50000,
    currency: 'NGN',
    customer: { customer_code: 'CUS_1' },
    metadata: { user_id: '11111111-1111-4111-8111-111111111111', plan: 'daily' },
    ...overrides,
  };
}

function mockList(data: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: true, data }),
  }));
}

beforeEach(() => {
  subscriptionResult = null;
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = originalSecret;
});

describe('reconcilePaystackCharges', () => {
  it('counts a missing PAYSTACK_SECRET_KEY as an error without listing charges', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const reconcile = await loadReconcile();

    await expect(reconcile({} as any)).resolves.toEqual({
      checked: 0,
      credited: 0,
      skippedRecorded: 0,
      skippedActive: 0,
      errors: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts a Paystack list HTTP failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const reconcile = await loadReconcile('sk_test_reconcile');

    const result = await reconcile({} as any);

    expect(result.errors).toBe(1);
    expect(result.checked).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('counts an atomic fulfillment RPC failure as a transaction error', async () => {
    mockList([transaction()]);
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'fulfillment unavailable' },
    });
    const reconcile = await loadReconcile('sk_test_reconcile');

    const result = await reconcile({ rpc } as any);

    expect(result).toEqual({
      checked: 1,
      credited: 0,
      skippedRecorded: 0,
      skippedActive: 0,
      errors: 1,
    });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('still sends an active existing charge to the atomic RPC and counts a duplicate', async () => {
    mockList([transaction({
      amount: 299900,
      metadata: { user_id: '11111111-1111-4111-8111-111111111111', plan: 'pro' },
    })]);
    subscriptionResult = { subscription_code: 'SUB_ACTIVE', email_token: 'EMAIL_ACTIVE' };
    const rpc = vi.fn().mockResolvedValue({
      data: { credited: false, plan: 'pro', expires_at: '2030-01-01T00:00:00Z' },
      error: null,
    });
    const reconcile = await loadReconcile('sk_test_reconcile');

    const result = await reconcile({ rpc } as any);

    expect(result).toEqual({
      checked: 1,
      credited: 0,
      skippedRecorded: 1,
      skippedActive: 0,
      errors: 0,
    });
    expect(rpc).toHaveBeenCalledWith('fulfill_paystack_charge', expect.objectContaining({
      p_reference: 'reconcile_ref',
      p_selection: 'pro',
      p_subscription_code: 'SUB_ACTIVE',
      p_email_token: 'EMAIL_ACTIVE',
    }));
  });
});
