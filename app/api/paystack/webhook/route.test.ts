// Route-handler tests for the Paystack webhook. The cryptographic signature
// check runs for real (we compute a matching HMAC-SHA512); every I/O boundary
// (Supabase, email, referral, Paystack subscription lookup) is stubbed so the
// test asserts the ORCHESTRATION: signature gating, idempotency/dedup, plan &
// amount validation, and the per-event-type side effects.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { makeSupabaseMock, type QueryResolver } from '@/lib/test/supabase-mock';

const TEST_SECRET = 'sk_test_webhook_secret';
process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;

// ── Mutable test doubles the mocks delegate to ───────────────────────────
let resolver: QueryResolver = () => ({});
let rpcResolver: ((n: string, a: unknown) => any) | undefined;
const sentEmails: Array<{ to: string; subject: string }> = [];
const referralCalls: unknown[] = [];
let fetchSubResult: unknown = null;

vi.mock('@/lib/supabase/server', () => ({
  createAdminSupabaseClient: () => makeSupabaseMock((ctx) => resolver(ctx), rpcResolver),
}));
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (m: { to: string; subject: string }) => { sentEmails.push({ to: m.to, subject: m.subject }); },
}));
vi.mock('@/lib/email/templates', () => ({
  paymentFailedEmail: (name: string, plan: string) => ({ subject: `Payment failed: ${plan}`, html: `<p>${name}</p>` }),
}));
vi.mock('@/lib/paystack/subscription', () => ({
  fetchActiveSubscriptionForCustomer: async () => fetchSubResult,
}));
vi.mock('@/lib/referral/commission', () => ({
  recordReferralCommission: async (_db: unknown, args: unknown) => { referralCalls.push(args); },
}));
vi.mock('@/lib/log', () => ({
  logInfo: () => {}, logWarn: () => {}, logError: () => {},
}));

// Imported after env + mocks are in place.
const { POST } = await import('./route');

function sign(body: string) {
  return createHmac('sha512', TEST_SECRET).update(body).digest('hex');
}
function makeReq(bodyObj: unknown, signature?: string) {
  const body = JSON.stringify(bodyObj);
  const sig = signature ?? sign(body);
  return {
    text: async () => body,
    headers: { get: (k: string) => (k.toLowerCase() === 'x-paystack-signature' ? sig : null) },
  } as any;
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  resolver = () => ({});
  rpcResolver = () => ({ data: { credited: true, plan: 'pro', expires_at: '2026-10-17T00:00:00Z' }, error: null });
  sentEmails.length = 0;
  referralCalls.length = 0;
  fetchSubResult = null;
});

describe('signature gating', () => {
  it('rejects a request with no signature header (401)', async () => {
    const res = await POST(makeReq({ event: 'charge.success' }, '') as any);
    expect(res.status).toBe(401);
  });

  it('rejects a tampered signature (401)', async () => {
    const res = await POST(makeReq({ event: 'charge.success' }, 'deadbeef') as any);
    expect(res.status).toBe(401);
  });

  it('accepts a correctly-signed request (not 401/500) — proves the happy sig path', async () => {
    const res = await POST(makeReq({ event: 'charge.success', data: {} }) as any);
    expect(res.status).toBe(200);
  });
});

describe('idempotency / dedup', () => {
  it('short-circuits a duplicate event (unique_violation 23505) with 200', async () => {
    resolver = (ctx) => {
      if (ctx.table === 'paystack_webhook_events' && ctx.steps.includes('insert')) {
        return { error: { code: '23505' } };
      }
      if (ctx.table === 'paystack_webhook_events' && ctx.steps.includes('select')) return { data: { processed: true } };
      return {};
    };
    const res = await POST(makeReq({
      event: 'subscription.expiring_cards',
      data: { reference: 'ref_dup', id: 999, metadata: { user_id: VALID_UUID, plan: 'pro' } },
    }) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduplicated).toBe(true);
  });
});

describe('charge.success', () => {
  const chargeBody = (over: Record<string, unknown> = {}) => ({
    event: 'charge.success',
    data: {
      // ₦2,999 in kobo — the real `pro` plan amount (see PLAN_AMOUNTS_KOBO).
      reference: 'ref_ok', amount: 299900, currency: 'NGN', id: 1,
      customer: { customer_code: 'CUS_x' },
      metadata: { user_id: VALID_UUID, plan: 'pro' },
      ...over,
    },
  });

  it('retries an unprocessed duplicate event after an atomic credit failure', async () => {
    let attempts = 0;
    let markedProcessed = 0;
    resolver = ctx => {
      if (ctx.table === 'profiles') return { data: { id: VALID_UUID, role: 'user' } };
      if (ctx.table === 'paystack_webhook_events' && ctx.steps.includes('insert')) return { error: { code: '23505' } };
      if (ctx.table === 'paystack_webhook_events' && ctx.steps.includes('select')) return { data: { processed: false } };
      if (ctx.table === 'paystack_webhook_events' && ctx.steps.includes('update')) markedProcessed++;
      return {};
    };
    rpcResolver = () => ++attempts === 1
      ? { error: { message: 'temporary database failure' }, data: null }
      : { data: { credited: true, plan: 'pro', expires_at: null }, error: null };
    expect((await POST(makeReq(chargeBody()))).status).toBe(503);
    expect(markedProcessed).toBe(0);
    expect((await POST(makeReq(chargeBody()))).status).toBe(200);
    expect(markedProcessed).toBe(1);
    expect(referralCalls).toHaveLength(1);
  });

  it('does not confuse a profile read outage with a missing customer', async () => {
    resolver = ctx => ctx.table === 'profiles' ? { error: { message: 'unavailable' } } : {};
    expect((await POST(makeReq(chargeBody()))).status).toBe(503);
    expect(sentEmails).toHaveLength(0);
  });

  it('normalizes mobile annual metadata before crediting', async () => {
    resolver = ctx => ctx.table === 'profiles' ? { data: { id: VALID_UUID } } : {};
    rpcResolver = (_, args: any) => {
      expect(args.p_selection).toBe('pro_annual');
      return { data: { credited: true, plan: 'pro' } };
    };
    expect((await POST(makeReq(chargeBody({ amount: 2999900, metadata: { user_id: VALID_UUID, plan: 'pro', selection: 'annual' } })))).status).toBe(200);
  });

  it('rejects an amount that does not match the plan → orphan alert email, no credit', async () => {
    let profileUpdated = false;
    resolver = (ctx) => {
      if (ctx.table === 'profiles' && ctx.steps.includes('update')) { profileUpdated = true; return {}; }
      return {};
    };
    // ₦5 for a pro plan → mismatch.
    const res = await POST(makeReq(chargeBody({ amount: 500 })) as any);
    expect(res.status).toBe(200);
    expect(profileUpdated).toBe(false);
    expect(sentEmails.some(e => /Orphan/i.test(e.subject))).toBe(true);
  });

  it('alerts when the paying user_id does not exist in profiles (orphan charge)', async () => {
    resolver = (ctx) => {
      // validateUserId → profiles lookup returns nothing.
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) return { data: null };
      return {};
    };
    const res = await POST(makeReq(chargeBody()) as any);
    expect(res.status).toBe(200);
    expect(sentEmails.some(e => /Orphan/i.test(e.subject))).toBe(true);
  });

  it('credits a valid charge atomically and records referral', async () => {
    const updates: Record<string, unknown>[] = [];
    const calls: unknown[] = [];
    rpcResolver = (name, args) => {
      expect(name).toBe('fulfill_paystack_charge');
      calls.push(args);
      return { data: { credited: true, plan: 'pro', expires_at: null }, error: null };
    };
    resolver = (ctx) => {
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        // validateUserId + later profile role/expiry lookups.
        return { data: { id: VALID_UUID, role: 'user', plan_expires_at: null } };
      }
      if (ctx.table === 'profiles' && ctx.steps.includes('update')) { updates.push(ctx.payload as any); return {}; }
      if (ctx.table === 'paystack_transactions' && ctx.steps.includes('insert')) return {}; // claim succeeds
      return {};
    };
    const res = await POST(makeReq(chargeBody()) as any);
    expect(res.status).toBe(200);
    expect(updates.length).toBe(0); // no independent profile writes
    expect(calls).toEqual([expect.objectContaining({ p_reference: 'ref_ok', p_user_id: VALID_UUID, p_selection: 'pro' })]);
    expect(referralCalls.length).toBe(1);
  });

  it('does not double-credit when the reference is already claimed (23505)', async () => {
    rpcResolver = () => ({ data: { credited: false, plan: 'pro', expires_at: null }, error: null });
    const updates: unknown[] = [];
    resolver = (ctx) => {
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) return { data: { id: VALID_UUID, role: 'user' } };
      if (ctx.table === 'profiles' && ctx.steps.includes('update')) { updates.push(ctx.payload); return {}; }
      if (ctx.table === 'paystack_transactions' && ctx.steps.includes('insert')) return { error: { code: '23505' } };
      return {};
    };
    const res = await POST(makeReq(chargeBody()) as any);
    expect(res.status).toBe(200);
    expect(updates.length).toBe(0);       // credited path skipped
    expect(referralCalls.length).toBe(0);
  });

  it('never credits an admin plan write (admins keep permanent plan)', async () => {
    const updates: unknown[] = [];
    resolver = (ctx) => {
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { id: VALID_UUID, role: 'admin', plan_expires_at: null } };
      }
      if (ctx.table === 'profiles' && ctx.steps.includes('update')) { updates.push(ctx.payload); return {}; }
      return {};
    };
    const res = await POST(makeReq(chargeBody()) as any);
    expect(res.status).toBe(200);
    expect(updates.length).toBe(0);
  });
});

describe('subscription.expiring_cards — WARNING only, never downgrades', () => {
  it('does not touch subscriptions/profiles', async () => {
    let mutated = false;
    resolver = (ctx) => {
      if (['profiles', 'subscriptions'].includes(ctx.table) && ctx.steps.some(s => s === 'update' || s === 'upsert')) mutated = true;
      return {};
    };
    const res = await POST(makeReq({
      event: 'subscription.expiring_cards',
      data: { id: 7, metadata: { user_id: VALID_UUID } },
    }) as any);
    expect(res.status).toBe(200);
    expect(mutated).toBe(false);
  });
});

describe('subscription.disable — soft cancel, no plan downgrade', () => {
  it('marks the subscription cancelled but never writes profiles.plan', async () => {
    const subUpdates: Record<string, unknown>[] = [];
    let profileMutated = false;
    resolver = (ctx) => {
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) return { data: { id: VALID_UUID, role: 'user' } };
      if (ctx.table === 'profiles' && ctx.steps.includes('update')) { profileMutated = true; return {}; }
      if (ctx.table === 'subscriptions' && ctx.steps.includes('update')) { subUpdates.push(ctx.payload as any); return {}; }
      return {};
    };
    const res = await POST(makeReq({
      event: 'subscription.disable',
      data: { id: 8, metadata: { user_id: VALID_UUID } },
    }) as any);
    expect(res.status).toBe(200);
    expect(profileMutated).toBe(false);
    expect(subUpdates.length).toBe(1);
    expect(subUpdates[0].status).toBe('cancelled');
  });
});

describe('invoice.payment_failed — end the paid period + email the user', () => {
  it('sets status=payment_failed, shortens period, and emails the user', async () => {
    const subUpdates: Record<string, unknown>[] = [];
    resolver = (ctx) => {
      if (ctx.table === 'subscriptions' && ctx.steps.includes('select')) {
        return { data: { user_id: VALID_UUID, plan: 'pro' } };
      }
      if (ctx.table === 'subscriptions' && ctx.steps.includes('update')) { subUpdates.push(ctx.payload as any); return {}; }
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { name: 'Ada', email: 'ada@example.com', role: 'user', plan: 'pro' } };
      }
      return {};
    };
    const res = await POST(makeReq({
      event: 'invoice.payment_failed',
      data: { id: 9, subscription: { subscription_code: 'SUB_1' }, customer: {} },
    }) as any);
    expect(res.status).toBe(200);
    expect(subUpdates.length).toBe(1);
    expect(subUpdates[0].status).toBe('payment_failed');
    expect(subUpdates[0].current_period_end).toBeTruthy();
    expect(sentEmails.some(e => e.to === 'ada@example.com')).toBe(true);
  });

  it('skips admins entirely (no downgrade, no email)', async () => {
    let subMutated = false;
    resolver = (ctx) => {
      if (ctx.table === 'subscriptions' && ctx.steps.includes('select')) return { data: { user_id: VALID_UUID, plan: 'pro' } };
      if (ctx.table === 'subscriptions' && ctx.steps.includes('update')) { subMutated = true; return {}; }
      if (ctx.table === 'profiles' && ctx.steps.includes('select')) {
        return { data: { name: 'Root', email: 'root@example.com', role: 'admin', plan: 'pro' } };
      }
      return {};
    };
    const res = await POST(makeReq({
      event: 'invoice.payment_failed',
      data: { id: 10, subscription: { subscription_code: 'SUB_2' }, customer: {} },
    }) as any);
    expect(res.status).toBe(200);
    expect(subMutated).toBe(false);
    expect(sentEmails.length).toBe(0);
  });
});
