// supabase/functions/paystack-initialize/index.ts
//
// Starts a Paystack transaction for the signed-in user's chosen plan and
// returns the hosted checkout URL. The app opens that URL in an in-app browser;
// when the browser closes the app calls paystack-verify with the reference.
//
// Deploy: supabase functions deploy paystack-initialize
// Required secret: PAYSTACK_SECRET_KEY  (Supabase → Project Settings → Edge
//   Functions → Secrets). SUPABASE_URL / SUPABASE_ANON_KEY are injected for you.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Plan → price in kobo (₦ × 100) + how long it lasts. Mirrors the Plans screen.
const PLANS: Record<string, { amount: number; days: number; plan: 'daily' | 'pro' }> = {
  daily: { amount: 50_000, days: 1, plan: 'daily' }, // ₦500 / 24h
  pro: { amount: 299_900, days: 30, plan: 'pro' }, // ₦2,999 / month
  annual: { amount: 2_999_900, days: 365, plan: 'pro' }, // ₦29,999 / year (Pro tier)
};

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
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.email) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const { plan } = await req.json().catch(() => ({}));
  const cfg = PLANS[plan as string];
  if (!cfg) return Response.json({ error: 'Unknown plan.' }, { status: 400 });

  // No callback_url: Paystack shows its own success page; the app verifies by
  // reference once the in-app browser closes (robust without a web redirect).
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      amount: cfg.amount,
      currency: 'NGN',
      metadata: { user_id: user.id, plan: cfg.plan, days: cfg.days, selection: plan },
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.status) {
    return Response.json({ error: body?.message ?? 'Could not start payment.' }, { status: 502 });
  }
  return Response.json({ authorization_url: body.data.authorization_url, reference: body.data.reference });
});
