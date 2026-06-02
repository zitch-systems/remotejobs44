// app/api/paystack/initialize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PLAN_AMOUNTS_KOBO as PLAN_AMOUNTS, canPurchase } from '@/lib/paystack/plans';
import { resolvePlan } from '@/lib/auth/plan';
import { rateLimit, releaseRateLimit, getIP } from '@/lib/rate-limit';
import { logError, logWarn } from '@/lib/log';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  // Coarse per-IP flood guard. Reaching the outbound Paystack call below
  // requires an authenticated, email-confirmed user, so the meaningful
  // abuse control is the per-user limit further down. This IP cap only
  // stops an unauthenticated request flood from hammering Supabase auth,
  // and is deliberately generous: many legitimate users share a single
  // carrier-grade NAT IP (very common on Nigerian mobile networks), so a
  // tight per-IP cap locks real users out of each other's budgets — which
  // is exactly the bug this route used to have (5 / IP / hour).
  const ip = getIP(req);
  const ipRl = rateLimit(`paystack-init:ip:${ip}`, 30, HOUR_MS);
  if (!ipRl.success) {
    const retryAfter = Math.max(1, Math.ceil((ipRl.resetAt - Date.now()) / 1000));
    logWarn({ event: 'paystack.initialize.ip_cap_hit', ip });
    return NextResponse.json(
      { error: `Too many requests. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // Per-user rate-limit bookkeeping. Only a *successful* initialization
  // should count against the user's hourly budget — a failure on our side
  // (Paystack rejecting the call, a bad redirect, an exception) creates no
  // Paystack reference object, so the token is refunded in `finally`. This
  // stops our own outages from locking a paying user out after a few clicks.
  let rlKey: string | null = null;
  let consumed = false;
  let started  = false;

  try {
    // Prefer NEXT_PUBLIC_APP_URL to avoid localhost bleed on Paystack callback
    const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || new URL(req.url).origin;
    const { plan } = await req.json();

    if (!plan || !PLAN_AMOUNTS[plan]) {
      return NextResponse.json({ error: 'Invalid plan. Must be: daily, pro, or pro_annual' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'You must be logged in to subscribe' }, { status: 401 });
    }
    // Email-confirmation gate before we open a payment session. Stops
    // an unverified throwaway account from creating Paystack
    // transactions (some of which Paystack still bills test fees for)
    // and keeps the user contactable when something goes wrong with
    // their order.
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Please confirm your email address before subscribing. Check your inbox for the verification link.' },
        { status: 403 },
      );
    }

    // Upgrade-only guard: you can only move *up* (free→daily→pro→annual),
    // never re-buy the plan you already hold or downgrade. resolvePlan
    // collapses the verify→webhook race and treats an expired plan as
    // 'free', so a lapsed user can buy again. Runs before the rate-limit
    // consume and any Paystack call, so a blocked attempt is free.
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role, plan, plan_expires_at')
      .eq('id', user.id)
      .maybeSingle();
    const currentTier = resolvePlan({
      role:          currentProfile?.role,
      dbPlan:        currentProfile?.plan,
      planExpiresAt: currentProfile?.plan_expires_at,
    });
    // Pro monthly and annual share the 'pro' tier, so pull billing to tell
    // a monthly→annual upgrade (allowed) apart from a monthly re-buy (not).
    let currentBilling: string | null = null;
    if (currentTier === 'pro') {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('billing')
        .eq('user_id', user.id)
        .maybeSingle();
      currentBilling = sub?.billing ?? null;
    }
    const decision = canPurchase({ tier: currentTier, billing: currentBilling }, plan);
    if (!decision.ok) {
      logWarn({ event: 'paystack.initialize.blocked_not_upgrade', user_id: user.id, requested: plan });
      return NextResponse.json({ error: decision.reason }, { status: 409 });
    }

    // Real abuse control: per-user, not per-IP, so users behind a shared
    // NAT get independent budgets. 5 successful initializations per hour
    // is plenty for a legitimate user.
    rlKey = `paystack-init:${user.id}`;
    const rl = rateLimit(rlKey, 5, HOUR_MS);
    if (!rl.success) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      logWarn({ event: 'paystack.initialize.rate_limited', user_id: user.id });
      return NextResponse.json(
        { error: `Too many subscription attempts. Try again in ${retryAfter} seconds.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
    consumed = true;

    const amount = PLAN_AMOUNTS[plan];

    // Every tier is a one-time charge — we deliberately do NOT attach a
    // Paystack `plan`/subscription. Two reasons: (1) Paystack restricts
    // subscription checkouts to card only, whereas a plain charge offers
    // every channel (card, bank, USSD, transfer); (2) it removes the
    // plan-code dependency entirely. Access is time-boxed by
    // plan_expires_at (Day Pass 24h, Pro 30d, Pro Annual 1y — see
    // getPlanExpiry) and the user re-pays to renew when it lapses.
    const body: Record<string, any> = {
      email: user.email,
      amount,
      currency: 'NGN',
      callback_url: `${APP_URL}/api/paystack/verify`,
      metadata: {
        user_id: user.id,
        plan,
        cancel_action: `${APP_URL}/pricing`,
      },
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    };

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data.status) {
      // Don't echo Paystack's upstream message to the browser. Their
      // failure strings sometimes include integration hints
      // ("Invalid key", "Plan code X not found", "Test mode key on live
      // call") that leak more about our merchant config than a generic
      // message would. The full upstream payload is logged so we can
      // diagnose the real cause server-side.
      logError({ event: 'paystack.initialize.upstream_error', upstream_data: data });
      return NextResponse.json({ error: 'Payment initialization failed. Please try again.' }, { status: 500 });
    }

    // Defence-in-depth on the redirect target. The client does
    // `window.location.href = authorizationUrl` so anything we return
    // here lands as a top-level nav. Paystack's hosted checkout always
    // serves from checkout.paystack.com, so we pin that host explicitly
    // — if a compromised / spoofed Paystack response (or a future API
    // change) ever returns a different origin, we refuse rather than
    // bouncing the user to an attacker-controlled URL.
    const authorizationUrl: string = data.data?.authorization_url ?? '';
    try {
      const u = new URL(authorizationUrl);
      if (u.protocol !== 'https:' || u.hostname !== 'checkout.paystack.com') {
        logError({ event: 'paystack.initialize.unexpected_redirect_host', host: u.hostname });
        return NextResponse.json({ error: 'Payment initialization failed. Please try again.' }, { status: 500 });
      }
    } catch {
      logError({ event: 'paystack.initialize.unparseable_redirect', url: authorizationUrl.slice(0, 200) });
      return NextResponse.json({ error: 'Payment initialization failed. Please try again.' }, { status: 500 });
    }

    // Init succeeded and the redirect target is trusted — keep the
    // consumed token (don't refund) and hand the URL to the client.
    started = true;
    return NextResponse.json({
      success: true,
      authorizationUrl,
      reference: data.data.reference,
    });
  } catch (err: any) {
    logError({ event: 'paystack.initialize.unhandled', error: err?.message ?? String(err) });
    // Generic message — Paystack SDK / env errors can carry internal
    // detail that doesn't belong on a public response.
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 });
  } finally {
    // Refund the per-user token unless we actually started a Paystack
    // session. A failed init creates no Paystack reference object, so it
    // must not count against the user's hourly budget.
    if (consumed && !started && rlKey) releaseRateLimit(rlKey);
  }
}
