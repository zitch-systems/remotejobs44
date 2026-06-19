// src/lib/paystack.ts — in-app subscription checkout via Paystack.
//
// Flow: ask the `paystack-initialize` edge function for a hosted checkout URL,
// open it in an in-app browser, then (once it closes) verify the reference with
// `paystack-verify`, which upgrades the plan. We verify by the reference we
// created rather than relying on a deep-link redirect, so it's robust even when
// Paystack shows its own success page and the user closes the sheet manually.
//
// Requires the two edge functions deployed AND the PAYSTACK_SECRET_KEY secret
// set. Until then initialize returns `not_configured` and the caller falls back
// to the web checkout.
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

export type PaystackPlan = 'daily' | 'pro' | 'annual';
export type CheckoutResult = { status: 'success'; plan: string } | { status: 'cancelled' };

/** Thrown when payments aren't configured server-side yet — callers fall back. */
export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('Payments are not configured yet.');
    this.name = 'PaymentsNotConfiguredError';
  }
}

export async function startSubscription(plan: PaystackPlan): Promise<CheckoutResult> {
  const init = await supabase.functions.invoke('paystack-initialize', { body: { plan } });
  // Functions not deployed → invoke errors; treat that as "not configured" too.
  if (init.error) throw new PaymentsNotConfiguredError();
  if (init.data?.configured === false) throw new PaymentsNotConfiguredError();
  const authorizationUrl: string | undefined = init.data?.authorization_url;
  const reference: string | undefined = init.data?.reference;
  if (!authorizationUrl || !reference) throw new Error('Could not start payment.');

  await WebBrowser.openAuthSessionAsync(authorizationUrl, 'remotejobs44://paystack-return');

  // Verify regardless of how the browser closed — the reference is the source of
  // truth. A genuine cancel just verifies as "not completed" → cancelled.
  const verify = await supabase.functions.invoke('paystack-verify', { body: { reference } });
  if (verify.error || !verify.data?.ok) return { status: 'cancelled' };
  return { status: 'success', plan: verify.data.plan };
}
