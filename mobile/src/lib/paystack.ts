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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { invalidateEntitlements } from './entitlement-invalidation';

export type PaystackPlan = 'daily' | 'pro' | 'annual';
export type CheckoutResult = { status: 'success'; plan: string } | { status: 'pending' } | { status: 'cancelled' };

const PENDING_KEY = 'rj44-pending-paystack-v1';
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const REFERENCE_RE = /^[A-Za-z0-9_-]{1,200}$/;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type PendingCheckout = { reference: string; userId: string; plan: PaystackPlan; createdAt: number };

async function currentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

async function savePending(pending: PendingCheckout): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export async function clearPendingCheckout(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}

async function loadValidPendingCheckout(): Promise<PendingCheckout | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await clearPendingCheckout();
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await clearPendingCheckout();
    return null;
  }
  const pending = parsed as Partial<PendingCheckout>;
  const now = Date.now();
  if (typeof pending.reference !== 'string' || typeof pending.userId !== 'string'
    || !REFERENCE_RE.test(pending.reference) || !USER_ID_RE.test(pending.userId)
    || typeof pending.plan !== 'string' || !['daily', 'pro', 'annual'].includes(pending.plan)
    || typeof pending.createdAt !== 'number' || !Number.isFinite(pending.createdAt) || pending.createdAt <= 0
    || pending.createdAt > now + MAX_CLOCK_SKEW_MS || pending.createdAt + PENDING_TTL_MS < now) {
    await clearPendingCheckout();
    return null;
  }
  return pending as PendingCheckout;
}

/** Check recovery availability without exposing its reference or owner. */
export async function hasPendingCheckout(): Promise<boolean> {
  return Boolean(await loadValidPendingCheckout());
}

export async function loadOwnPendingCheckout(): Promise<PendingCheckout | null> {
  const pending = await loadValidPendingCheckout();
  if (!pending) return null;
  // An auth/network failure is uncertain: preserve the legitimate pending
  // checkout so a later resume can retry. Only a resolved different/no user
  // proves this record does not belong to the current session.
  const userId = await currentUserId();
  // Signed out is not a different owner. Preserve the record so signing back
  // into the same account can recover it, but never return it for verification.
  if (!userId) return null;
  if (pending.userId !== userId) {
    await clearPendingCheckout();
    return null;
  }
  return pending;
}

async function functionErrorBody(error: unknown): Promise<{ status?: number; error?: string; transactionStatus?: string } | null> {
  const context = (error as { context?: { status?: number; clone?: () => unknown; json?: () => Promise<unknown> } })?.context;
  if (!context) return null;
  try {
    const readable = typeof context.clone === 'function' ? context.clone() as { json?: () => Promise<unknown> } : context;
    const body = typeof readable.json === 'function' ? await readable.json() : null;
    if (!body || typeof body !== 'object') return { status: context.status };
    return {
      status: context.status,
      error: typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : undefined,
      transactionStatus: typeof (body as { transaction_status?: unknown }).transaction_status === 'string'
        ? (body as { transaction_status: string }).transaction_status.toLowerCase()
        : undefined,
    };
  } catch {
    return { status: context.status };
  }
}

const verificationByReference = new Map<string, Promise<CheckoutResult>>();

async function verifyPendingOnce(pending: PendingCheckout): Promise<CheckoutResult> {
  const verify = await supabase.functions.invoke('paystack-verify', { body: { reference: pending.reference } });
  if (verify.error) {
    const response = await functionErrorBody(verify.error);
    if (response?.status === 402 && response.error === 'Payment not completed.') {
      if (response.transactionStatus && ['abandoned', 'failed', 'reversed'].includes(response.transactionStatus)) {
        await clearPendingCheckout();
        return { status: 'cancelled' };
      }
      // pending/ongoing/processing, or a legacy response without a trustworthy
      // provider status, is uncertain and must remain resumable.
      return { status: 'pending' };
    }
    // Definitive invalid/foreign references cannot become successful later.
    if ((response?.status === 400 || response?.status === 403) && response.error) await clearPendingCheckout();
    throw new Error(response?.error ?? 'Could not verify payment. Please try again; you will not be charged twice.');
  }
  if (!verify.data?.ok) {
    if (verify.data?.error === 'Payment not completed.') {
      return { status: 'pending' };
    }
    throw new Error(verify.data?.error ?? 'Could not verify payment. Please try again.');
  }
  if (verify.data.plan !== 'daily' && verify.data.plan !== 'pro') {
    throw new Error('Payment was verified, but the plan response was invalid. Contact support.');
  }
  await clearPendingCheckout();
  invalidateEntitlements();
  return { status: 'success', plan: verify.data.plan };
}

function verifyPending(pending: PendingCheckout): Promise<CheckoutResult> {
  const running = verificationByReference.get(pending.reference);
  if (running) return running;
  const request = verifyPendingOnce(pending).finally(() => verificationByReference.delete(pending.reference));
  verificationByReference.set(pending.reference, request);
  return request;
}

/** Resume only the current user's locally-created reference; URL input is ignored. */
export async function resumePendingSubscription(): Promise<CheckoutResult | null> {
  const pending = await loadOwnPendingCheckout();
  return pending ? verifyPending(pending) : null;
}

/** Thrown when payments aren't configured server-side yet — callers fall back. */
export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('Payments are not configured yet.');
    this.name = 'PaymentsNotConfiguredError';
  }
}

export async function startSubscription(plan: PaystackPlan): Promise<CheckoutResult> {
  const existing = await loadOwnPendingCheckout();
  if (existing) return verifyPending(existing);
  const userId = await currentUserId();
  if (!userId) throw new Error('Sign in before starting checkout.');
  const init = await supabase.functions.invoke('paystack-initialize', { body: { plan } });
  if (init.error) throw new Error('Could not start checkout. Please try again.');
  if (init.data?.configured === false) throw new PaymentsNotConfiguredError();
  const authorizationUrl: string | undefined = init.data?.authorization_url;
  const reference: string | undefined = init.data?.reference;
  if (typeof authorizationUrl !== 'string' || typeof reference !== 'string' || !REFERENCE_RE.test(reference)) throw new Error('Could not start payment.');
  try {
    const checkout = new URL(authorizationUrl);
    if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paystack.com' || checkout.port || checkout.username || checkout.password) throw new Error();
  } catch {
    throw new Error('Checkout returned an invalid payment URL.');
  }

  await savePending({ reference, userId, plan, createdAt: Date.now() });

  await WebBrowser.openAuthSessionAsync(authorizationUrl, 'remotejobs44://paystack-return');
  return verifyPending({ reference, userId, plan, createdAt: Date.now() });
}
