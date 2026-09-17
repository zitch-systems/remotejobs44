// lib/paystack/reconcile.ts
// Safety net for the "paid but not credited" failure mode. Crediting normally
// happens two ways: the post-payment redirect (/api/paystack/verify) and the
// charge.success webhook (/api/paystack/webhook). If the redirect doesn't
// complete AND the webhook isn't delivered (e.g. webhook URL not configured,
// or a transient outage), the customer is charged on Paystack but never gets
// access — with no trace in our DB.
//
// Poll recent successful Paystack charges and fulfill each atomically. Active
// access is not a reason to discard a genuine renewal; the ledger prevents replay.
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import {
  isValidPlan, chargeMatchesPlan, getPlanTier,
} from '@/lib/paystack/plans';
import { fulfillPaystackCharge, paymentPlanFromMetadata } from '@/lib/paystack/fulfill';
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
    res.errors++;
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
      if (!r.ok) { res.errors++; logWarn({ event: 'reconcile.list_failed', status: r.status, page }); break; }
      const body = await r.json();
      if (!body?.status || !Array.isArray(body.data)) throw new Error('Invalid Paystack transaction response');
      txns = body.data;
    } catch (err: any) {
      res.errors++;
      logWarn({ event: 'reconcile.list_threw', error: err?.message ?? String(err), page });
      break;
    }
    if (txns.length === 0) break;

    for (const txn of txns) {
      res.checked++;
      try {
        const reference = txn?.reference;
        const plan      = paymentPlanFromMetadata(txn?.metadata);
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

        // Use the SAME transaction as callbacks/webhooks. A prior successful
        // credit is a safe no-op; a failed transaction left no poisoned claim.
        const tier = getPlanTier(plan);
        const paystackSub = plan === 'daily'
          ? null
          : await fetchActiveSubscriptionForCustomer(customer?.customer_code);
        const fulfillment = await fulfillPaystackCharge(supabase, {
          reference, userId, plan, amount, currency,
          customerCode: customer?.customer_code,
          subscriptionCode: paystackSub?.subscription_code,
          emailToken: paystackSub?.email_token,
        });
        if (!fulfillment.credited) { res.skippedRecorded++; continue; }

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
