import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSupabaseMock, type QueryResolver } from '@/lib/test/supabase-mock';

process.env.PAYSTACK_SECRET_KEY = 'sk_test_verify';
process.env.NEXT_PUBLIC_APP_URL = 'https://remotejobs.test';

let resolver: QueryResolver = () => ({});
let rpcResult: { data?: unknown; error?: unknown } = {};
const rpcCalls: Array<{ name: string; args: any }> = [];
const referralCalls: unknown[] = [];
let subscriptionResult: unknown = null;

vi.mock('@/lib/supabase/server', () => ({
  createAdminSupabaseClient: () => makeSupabaseMock(
    (ctx) => resolver(ctx),
    (name, args) => {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
  ),
}));
vi.mock('@/lib/paystack/subscription', () => ({
  fetchActiveSubscriptionForCustomer: async () => subscriptionResult,
}));
vi.mock('@/lib/referral/commission', () => ({
  recordReferralCommission: async (_db: unknown, args: unknown) => { referralCalls.push(args); },
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: async () => true }));
vi.mock('@/lib/email/templates', () => ({
  paymentSuccessEmail: () => ({ subject: 'Payment received', html: '<p>Paid</p>' }),
}));
vi.mock('@/lib/log', () => ({ logError: () => {}, logWarn: () => {} }));

const { GET } = await import('./route');

function request(reference: string) {
  return { nextUrl: new URL(`https://callback.test/api/paystack/verify?reference=${encodeURIComponent(reference)}`) } as any;
}

function successfulCharge(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    data: {
      status: 'success',
      reference: 'ref_ok',
      amount: 299900,
      currency: 'NGN',
      customer: { customer_code: 'CUS_1' },
      metadata: { user_id: '11111111-1111-4111-8111-111111111111', plan: 'pro' },
      ...overrides,
    },
  };
}

function mockPaystack(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));
}

beforeEach(() => {
  resolver = () => ({});
  rpcResult = { data: { credited: true, plan: 'pro', expires_at: '2030-01-01T00:00:00Z' } };
  rpcCalls.length = 0;
  referralCalls.length = 0;
  subscriptionResult = null;
  vi.unstubAllGlobals();
});

describe('Paystack verify callback', () => {
  it('does not return a success redirect when atomic fulfillment fails', async () => {
    mockPaystack(successfulCharge());
    rpcResult = { error: { message: 'database transaction failed' } };

    const response = await GET(request('ref_rpc_failure'));

    expect(response.headers.get('location')).toBe('https://remotejobs.test/pricing?error=server_error');
    expect(rpcCalls).toHaveLength(1);
    expect(referralCalls).toHaveLength(0);
  });

  it('treats an already-recorded charge as a safe success', async () => {
    mockPaystack(successfulCharge());
    rpcResult = { data: { credited: false, plan: 'pro', expires_at: '2030-01-01T00:00:00Z' } };

    const response = await GET(request('ref_duplicate'));

    expect(response.headers.get('location')).toBe(
      'https://remotejobs.test/pricing?success=1&plan=pro&upgraded=1',
    );
    expect(rpcCalls).toHaveLength(1);
    expect(referralCalls).toHaveLength(0);
  });

  it('rejects a malformed reference without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('../customer/123'));

    expect(response.headers.get('location')).toBe(
      'https://remotejobs.test/pricing?error=invalid_reference',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects an amount mismatch without invoking fulfillment', async () => {
    mockPaystack(successfulCharge({ amount: 50000 }));

    const response = await GET(request('ref_underpaid'));

    expect(response.headers.get('location')).toBe(
      'https://remotejobs.test/pricing?error=amount_mismatch',
    );
    expect(rpcCalls).toHaveLength(0);
  });

  it('accepts mobile annual metadata and fulfills the annual plan', async () => {
    mockPaystack(successfulCharge({
      amount: 2999900,
      metadata: {
        user_id: '11111111-1111-4111-8111-111111111111',
        selection: 'annual',
      },
    }));
    subscriptionResult = { subscription_code: 'SUB_1', email_token: 'EMAIL_1' };

    const response = await GET(request('ref_mobile_annual'));

    expect(response.headers.get('location')).toBe(
      'https://remotejobs.test/pricing?success=1&plan=pro&upgraded=1',
    );
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toEqual({
      name: 'fulfill_paystack_charge',
      args: expect.objectContaining({
        p_reference: 'ref_mobile_annual',
        p_selection: 'pro_annual',
        p_amount: 2999900,
        p_subscription_code: 'SUB_1',
        p_email_token: 'EMAIL_1',
      }),
    });
  });
});
