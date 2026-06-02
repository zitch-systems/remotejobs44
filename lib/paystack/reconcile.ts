// lib/paystack/reconcile.ts
// Safety net for the "paid but not credited" failure mode. Crediting normally
// happens two ways: the post-payment redirect (/api/paystack/verify) and the
// charge.success webhook (/api/paystack/webhook). If the redirect doesn't
// complete AND the webhook isn't delivered (e.g. webhook URL not configured,
// or a transient outage), the customer is charged on Paystack but never gets
// access — with no trace in our DB.
//
// This polls Paystack's own list-transactions API for recent SUCCESSFUL
// charges and credits any that slipped through. Idempotent on two axes:
//   1. paystack_reference already on a subscription row  → already credited.
//   2. user already has active paid access               → nothing to fix
//      (also prevents double-crediting a hand-credited user).
// So it only ever backfills users who genuinely paid and have no access.
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import {
  isValidPlan, chargeMatchesPlan, getPlanTier, getBilling, getPlanExpiry,
} from '@/lib/paystack/plans';
import { fetchActiveSubscriptionForCustomer } from '@/lib/paystack/subscription';
import { logInfo, logWarn, logError } from '@/lib/log';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';
type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;

export interface ReconcileResult {
  checked:        number;
  credited:       number;
  skippedRecorded:number;
  skippedActive:  number;
  errors:         number;
}

export async function reconcilePaystackCharges(
  supabase: AdminSupabase,
  opts: { sinceDays?: number; maxPages?: number; perPage?: number } = {},
): Promise<ReconcileResult> {
  const res: ReconcileResult = { checked: 0, credited: 0, skippedRecorded: 0, skippedActive: 0, errors: 0 };
  if (!PAYSTACK_SECRET) {
    logError({ event: 'reconcile.misconfigured', detail: 'PAYSTACK_SECRET_KEY missing' });
    return res;
  }

  const sinceDays = opts.sinceDays ?? 7;
  const maxPages  = opts.maxPages ?? 3;
  const perPage   = opts.perPage ?? 100;
  const fromIso   = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  for (let page = 1; page <= maxPages; page++) {
    let txns: any[] = [];
    try {
      const url = new URL('https://api.paystack.co/transaction');
      url.searchParams.set('status', 'success');
      url.searchParams.set('perPage', String(perPage));
      url.searchParams.set('page', String(page));
      url.searchParams.set('from', fromIso);
      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) { logWarn({ event: 'reconcile.list_failed', status: r.status, page }); break; }
      const body = await r.json();
      txns = Array.isArray(body?.data) ? body.data : [];
    } catch (err: any) {
      logWarn({ event: 'reconcile.list_threw', error: err?.message ?? String(err), page });
      break;
    }
    if (txns.length === 0) break;

    for (const txn of txns) {
      res.checked++;
      try {
        const reference = txn?.reference;
        const plan      = txn?.metadata?.plan;
        const userId    = txn?.metadata?.user_id;
        const amount    = txn?.amount;
        const currency  = txn?.currency;
        const customer  = txn?.customer;

        // Skip charges without the metadata our checkout attaches, or with a
        // plan/amount that doesn't line up (tamper guard, mirrors verify).
        if (!reference || !userId || !plan || !isValidPlan(plan)) continue;
        if (!chargeMatchesPlan(plan, amount, currency)) {
          res.errors++;
          logWarn({ event: 'reconcile.amount_mismatch', reference, plan, amount, currency });
          continue;
        }

        // (1) Already credited this exact charge?
        const { data: existingRef } = await supabase
          .from('subscriptions').select('user_id').eq('paystack_reference', reference).maybeSingle();
        if (existingRef) { res.skippedRecorded++; continue; }

        const { data: profile } = await supabase
          .from('profiles').select('id, role, plan, plan_expires_at').eq('id', userId).maybeSingle();
        if (!profile) {
          // Money charged for a user that no longer exists — leave for manual
          // review (the webhook path emails ops; here we just log).
          res.errors++;
          logWarn({ event: 'reconcile.orphan_charge', reference, user_id: userId });
          continue;
        }

        // (2) Already has active paid access? Nothing to fix — also stops a
        // double-credit of anyone hand-credited.
        const hasActiveAccess = !!profile.plan && profile.plan !== 'free'
          && !!profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() > Date.now();
        if (hasActiveAccess) { res.skippedActive++; continue; }

        // Credit — mirror /api/paystack/verify exactly.
        const tier      = getPlanTier(plan);
        const billing   = getBilling(plan);
        const expiresAt = getPlanExpiry(plan);

        if (profile.role !== 'admin') {
          await supabase.from('profiles').update({
            plan: tier, plan_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', userId);
        }

        const paystackSub = plan === 'daily'
          ? null
          : await fetchActiveSubscriptionForCustomer(customer?.customer_code);

        await supabase.from('subscriptions').upsert({
          user_id:                    userId,
          plan:                       tier,
          billing,
          status:                     'active',
          paystack_reference:         reference,
          paystack_customer_code:     customer?.customer_code ?? null,
          paystack_subscription_code: paystackSub?.subscription_code ?? null,
          paystack_email_token:       paystackSub?.email_token ?? null,
          current_period_start:       new Date().toISOString(),
          current_period_end:         expiresAt.toISOString(),
          currency:                   currency ?? 'NGN',
          price:                      (amount ?? 0) / 100,
        }, { onConflict: 'user_id' });

        res.credited++;
        logInfo({ event: 'reconcile.credited', reference, user_id: userId, tier });
      } catch (err: any) {
        res.errors++;
        logWarn({ event: 'reconcile.txn_failed', error: err?.message ?? String(err) });
      }
    }

    if (txns.length < perPage) break; // last page reached
  }

  logInfo({ event: 'reconcile.done', ...res });
  return res;
}
