// supabase/functions/paystack-initialize/index.ts
//
// Starts a Paystack transaction for the signed-in user's chosen plan and
// returns the hosted checkout URL. The app opens that URL in an in-app browser;
// when the browser closes the app calls paystack-verify with the reference.
//
// Deploy: supabase functions deploy paystack-initialize
// Required secret: PAYSTACK_SECRET_KEY  (Supabase → Project Settings → Edge
//   Functions → Secrets). SUPABASE_URL / SUPABASE_ANON_KEY are injected for you.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';

// Plan → price in kobo (₦ × 100) + how long it lasts. Mirrors the Plans screen.
type PlanSelection = 'daily' | 'pro' | 'annual';

const PLANS: Record<PlanSelection, { amount: number; days: number; plan: 'daily' | 'pro' }> = {
  daily: { amount: 50_000, days: 1, plan: 'daily' }, // ₦500 / 24h
  pro: { amount: 299_900, days: 30, plan: 'pro' }, // ₦2,999 / month
  annual: { amount: 2_999_900, days: 365, plan: 'pro' }, // ₦29,999 / year (Pro tier)
};

const SAFE_REFERENCE = /^[A-Za-z0-9_-]{1,200}$/;

function isPlanSelection(value: unknown): value is PlanSelection {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLANS, value);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  // 200 with configured:false (not an HTTP error) so the client can reliably
  // detect "not wired yet" and fall back to web checkout.
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return Response.json({ configured: false });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  let authResult;
  try {
    authResult = await userClient.auth.getUser();
  } catch {
    return Response.json({ error: 'Payment service is temporarily unavailable.' }, { status: 503 });
  }
  const { data: { user }, error: authError } = authResult;
  if (authError) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (!user?.email) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (!user.email_confirmed_at) {
    return Response.json(
      { error: 'Please confirm your email address before subscribing. Check your inbox for the verification link.' },
      { status: 403 },
    );
  }

  const payload: unknown = await req.json().catch(() => null);
  const plan = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).plan
    : undefined;
  if (!isPlanSelection(plan)) return Response.json({ error: 'Unknown plan.' }, { status: 400 });
  const cfg = PLANS[plan];

  // Upgrade-only guard (mirrors canPurchase in lib/paystack/plans.ts and the
  // web initialize route). Without this, an active Pro/Annual user could buy a
  // ₦500 Day Pass here and paystack-verify would clobber their entitlement
  // down to 24h. Rank: free 0 · daily 1 · pro-monthly 2 · pro-annual 3; a
  // purchase must be a strict upgrade. Admins pass (managed manually).
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: prof, error: profileError } = await admin
    .from('profiles')
    .select('role, plan, plan_expires_at, suspended')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !prof) {
    console.error('paystack-initialize profile lookup failed', profileError?.code ?? 'missing_profile');
    return Response.json({ error: 'Payment service is temporarily unavailable.' }, { status: 503 });
  }
  if (prof.suspended === true) {
    return Response.json({ error: 'Account suspended' }, { status: 403 });
  }
  if (prof.role !== 'admin') {
    let currentTier = prof.plan === 'daily' || prof.plan === 'pro' ? prof.plan : 'free';
    if (prof.plan_expires_at) {
      const activeMs = new Date(prof.plan_expires_at).getTime();
      if (!Number.isFinite(activeMs)) {
        console.error('paystack-initialize invalid plan expiry');
        return Response.json({ error: 'Payment service is temporarily unavailable.' }, { status: 503 });
      }
      if (activeMs < Date.now()) currentTier = 'free';
    }
    let curRank = 0;
    if (currentTier === 'daily') curRank = 1;
    if (currentTier === 'pro') {
      // Monthly and annual share the 'pro' tier — billing tells them apart.
      const { data: sub, error: subscriptionError } = await admin
        .from('subscriptions')
        .select('billing')
        .eq('user_id', user.id)
        .maybeSingle();
      if (subscriptionError) {
        console.error('paystack-initialize subscription lookup failed', subscriptionError.code ?? 'read_error');
        return Response.json({ error: 'Payment service is temporarily unavailable.' }, { status: 503 });
      }
      curRank = sub?.billing === 'annually' ? 3 : 2;
    }
    const reqRank = plan === 'annual' ? 3 : plan === 'pro' ? 2 : 1;
    if (reqRank <= curRank) {
      const reason = reqRank === curRank
        ? currentTier === 'daily'
          ? "Your Day Pass is still active — you can upgrade to Pro, but you can't buy another Day Pass yet."
          : "You're already on this plan. You can upgrade, but not re-buy the same plan while it's active."
        : "You're already on a higher plan — you can change plans once your current one expires.";
      return Response.json({ error: reason }, { status: 409 });
    }
  }

  try {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: cfg.amount,
        currency: 'NGN',
        callback_url: 'https://remotejobs44.com/mobile/payment-return',
        metadata: { user_id: user.id, plan: cfg.plan, days: cfg.days, selection: plan },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.status !== true) {
      return Response.json({ error: 'Could not start payment. Please try again.' }, { status: 503 });
    }

    const authorizationUrl = body?.data?.authorization_url;
    const reference = body?.data?.reference;
    let checkout: URL;
    try {
      checkout = new URL(authorizationUrl);
    } catch {
      return Response.json({ error: 'Could not start payment. Please try again.' }, { status: 503 });
    }
    if (
      checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paystack.com' ||
      checkout.username !== '' || checkout.password !== '' || checkout.port !== '' ||
      typeof reference !== 'string' || !SAFE_REFERENCE.test(reference)
    ) {
      return Response.json({ error: 'Could not start payment. Please try again.' }, { status: 503 });
    }

    return Response.json({ authorization_url: authorizationUrl, reference });
  } catch {
    return Response.json({ error: 'Could not start payment. Please try again.' }, { status: 503 });
  }
});
