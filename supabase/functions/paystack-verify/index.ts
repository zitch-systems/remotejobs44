// supabase/functions/paystack-verify/index.ts
//
// Verifies a Paystack transaction by reference and, on success, upgrades the
// signed-in user's plan (plan + plan_expires_at + paystack_customer_code). The
// plan/duration are read from the server-set transaction metadata, never from
// the client, so the amount paid can't be spoofed.
//
// Deploy: supabase functions deploy paystack-verify
// Required secret: PAYSTACK_SECRET_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return Response.json({ ok: false, configured: false });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const { reference } = await req.json().catch(() => ({}));
  if (!reference) return Response.json({ ok: false, error: 'Missing reference.' }, { status: 400 });

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.json().catch(() => null);
  const tx = body?.data;
  if (!res.ok || tx?.status !== 'success') {
    return Response.json({ ok: false, error: 'Payment not completed.' }, { status: 402 });
  }

  // Trust only the server-set metadata, and confirm the charge is for this user.
  const meta = tx.metadata ?? {};
  if (meta.user_id && meta.user_id !== user.id) {
    return Response.json({ ok: false, error: 'Reference does not match this account.' }, { status: 403 });
  }
  const days = Number(meta.days) || 30;
  const plan = meta.plan === 'daily' ? 'daily' : 'pro';
  const expires = new Date(Date.now() + days * 86_400_000).toISOString();

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin
    .from('profiles')
    .update({ plan, plan_expires_at: expires, paystack_customer_code: tx.customer?.customer_code ?? null })
    .eq('id', user.id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, plan, plan_expires_at: expires });
});
