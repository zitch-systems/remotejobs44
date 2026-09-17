// supabase/functions/paystack-verify/index.ts
//
// Verifies a Paystack transaction by reference and, on the FIRST successful
// verification, upgrades the signed-in user's plan. Hardened against:
//   - replay/double-grant: each reference is recorded in paystack_transactions
//     (primary key) and only the first insert grants the plan (idempotent).
//   - cross-account grant: the transaction's server-set metadata.user_id MUST
//     equal the caller (reject when absent).
//   - amount tampering: tx.amount + currency must match the canonical price for
//     the resolved plan.
//
// Deploy: supabase functions deploy paystack-verify
// Required secret: PAYSTACK_SECRET_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';

// Canonical prices (kobo) + duration. Must match paystack-initialize.
const PLANS: Record<string, { amount: number; days: number; plan: 'daily' | 'pro' }> = {
  daily: { amount: 50_000, days: 1, plan: 'daily' },
  pro: { amount: 299_900, days: 30, plan: 'pro' },
  annual: { amount: 2_999_900, days: 365, plan: 'pro' },
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return Response.json({ ok: false, configured: false }, { status: 503 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const { reference } = await req.json().catch(() => ({}));
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(reference)) return Response.json({ ok: false, error: 'Missing reference.' }, { status: 400 });

  try {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  const tx = body?.data;
  if (!res.ok || tx?.status !== 'success') {
    return Response.json({ ok: false, error: 'Payment not completed.' }, { status: 402 });
  }

  // The charge must belong to this user (metadata is server-set at initialize).
  const meta = tx.metadata ?? {};
  if (meta.user_id !== user.id) {
    return Response.json({ ok: false, error: 'Reference does not match this account.' }, { status: 403 });
  }
  // Resolve the plan and validate the amount actually paid.
  const cfg = PLANS[meta.selection as string];
  if (!cfg) return Response.json({ ok: false, error: 'Unknown plan.' }, { status: 400 });
  if (tx.amount !== cfg.amount || tx.currency !== 'NGN') {
    return Response.json({ ok: false, error: 'Payment amount mismatch.' }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const selection = meta.selection === 'annual' ? 'pro_annual' : meta.selection;
  const { data: fulfillment, error } = await admin.rpc('fulfill_paystack_charge', {
    p_reference: reference, p_user_id: user.id, p_selection: selection,
    p_amount: tx.amount, p_currency: tx.currency,
    p_customer_code: tx.customer?.customer_code ?? null,
  });
  if (error || !fulfillment || typeof fulfillment.credited !== 'boolean') {
    console.error('paystack-verify fulfillment failed', error?.code ?? 'invalid_result');
    return Response.json({ ok: false, error: 'Payment processing temporarily unavailable. Please retry verification.' }, { status: 503 });
  }
  return Response.json({
    ok: true, plan: fulfillment.plan, already: !fulfillment.credited,
    plan_expires_at: fulfillment.expires_at,
  });
  } catch {
    return Response.json({ ok: false, error: 'Payment verification temporarily unavailable. Please retry.' }, { status: 503 });
  }
});
