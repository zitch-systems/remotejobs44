// lib/paystack/transactions.ts
// Read-only payment history for the admin Payments page.
//
// Why hit Paystack directly instead of our own DB: the `subscriptions` table
// holds only the CURRENT state per user (one upserted row, keyed unique on
// user_id), and there is no local payments/transactions table. So the only
// complete record of "who paid, how much, when" — including renewals and
// churned subscribers — lives in Paystack. This lists successful charges from
// Paystack's transaction API, the same source the reconcile sweep already
// trusts (lib/paystack/reconcile.ts).
//
// Security: callers map every row to PaymentRecord (display columns only)
// before it leaves the server. Raw Paystack auth/token fields must never reach
// the browser, and PAYSTACK_SECRET_KEY stays server-side.
import { logWarn, logError } from '@/lib/log';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';

export interface PaymentRecord {
  reference:     string;
  paidAt:        string | null;   // ISO timestamp of the charge
  amount:        number;          // major units (₦) — already divided by 100
  currency:      string;
  plan:          string | null;   // from checkout metadata; may be absent
  userId:        string | null;   // from checkout metadata
  customerName:  string | null;
  customerEmail: string | null;
  channel:       string | null;   // card, bank, etc.
  status:        string;          // always 'success' for this list
}

export interface PaymentsPage {
  transactions: PaymentRecord[];
  page:         number;
  hasMore:      boolean;
  error:        string | null;
}

// Pure: map one raw Paystack transaction to a display record. Exported for
// unit testing — the kobo→naira conversion, customer-name assembly and
// metadata extraction are exactly where a silent display bug would hide.
export function mapPaystackTransaction(txn: any): PaymentRecord {
  const customer = txn?.customer ?? {};
  const name = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    reference:     String(txn?.reference ?? ''),
    paidAt:        txn?.paid_at ?? txn?.created_at ?? null,
    // Guard against a non-number amount so the UI never renders NaN.
    amount:        typeof txn?.amount === 'number' ? txn.amount / 100 : 0,
    currency:      txn?.currency ?? 'NGN',
    plan:          txn?.metadata?.plan ?? null,
    userId:        txn?.metadata?.user_id ?? null,
    customerName:  name || null,
    customerEmail: customer.email ?? null,
    channel:       txn?.channel ?? null,
    status:        txn?.status ?? 'success',
  };
}

export async function listPaystackTransactions(
  opts: { page?: number; perPage?: number; fromIso?: string | null } = {},
): Promise<PaymentsPage> {
  const page    = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 50));

  if (!PAYSTACK_SECRET) {
    logError({ event: 'payments.list.misconfigured', detail: 'PAYSTACK_SECRET_KEY missing' });
    return { transactions: [], page, hasMore: false, error: 'Payments are not configured.' };
  }

  try {
    const url = new URL('https://api.paystack.co/transaction');
    url.searchParams.set('status', 'success');
    url.searchParams.set('perPage', String(perPage));
    url.searchParams.set('page', String(page));
    if (opts.fromIso) url.searchParams.set('from', opts.fromIso);

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      logWarn({ event: 'payments.list.http_error', status: r.status, page });
      return { transactions: [], page, hasMore: false, error: 'Could not reach Paystack.' };
    }
    const body = await r.json();
    const raw  = Array.isArray(body?.data) ? body.data : [];
    // Prefer Paystack's pagination meta; fall back to a full-page heuristic.
    const pageCount = typeof body?.meta?.pageCount === 'number' ? body.meta.pageCount : null;
    const hasMore   = pageCount != null ? page < pageCount : raw.length === perPage;
    return { transactions: raw.map(mapPaystackTransaction), page, hasMore, error: null };
  } catch (err: any) {
    logWarn({ event: 'payments.list.threw', error: err?.message ?? String(err), page });
    return { transactions: [], page, hasMore: false, error: 'Could not reach Paystack.' };
  }
}
