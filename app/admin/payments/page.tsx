'use client';
import { useEffect, useState, useCallback } from 'react';
import { Receipt, Search, RefreshCw, DollarSign, Users } from 'lucide-react';

// Admin Payments — chronological history of successful Paystack charges.
// Data comes from /api/admin/payments (service-side; the browser never holds
// Paystack credentials). This is the authoritative "who has paid, over time"
// view — the subscriptions table only keeps each user's current state.

interface Payment {
  reference:     string;
  paidAt:        string | null;
  amount:        number;
  currency:      string;
  plan:          string | null;
  userId:        string | null;
  customerName:  string | null;
  customerEmail: string | null;
  channel:       string | null;
  status:        string;
}

const PLAN_LABEL: Record<string, string> = {
  pro_monthly:  'Pro · Monthly',
  pro_annual:   'Pro · Annual',
  pro_annually: 'Pro · Annual',
  pro:          'Pro',
  daily:        'Day Pass',
};

const BTN =
  'inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border ' +
  'border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 ' +
  'hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors disabled:opacity-50';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PaymentsPage() {
  const [payments, setPayments]       = useState<Payment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [q, setQ]                     = useState('');

  const load = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const r = await fetch(`/api/admin/payments?page=${p}`, { cache: 'no-store' });
      const d = await r.json();
      const txns = (d.transactions ?? []) as Payment[];
      setPayments(prev => (append ? [...prev, ...txns] : txns));
      setHasMore(!!d.hasMore);
      setError(d.error ?? null);
      setPage(p);
    } catch {
      if (!append) setPayments([]);
      setError('Could not load payments.');
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, false); }, [load]);

  const filtered = payments.filter(p =>
    !q ||
    p.customerEmail?.toLowerCase().includes(q.toLowerCase()) ||
    p.customerName?.toLowerCase().includes(q.toLowerCase()) ||
    p.reference?.toLowerCase().includes(q.toLowerCase())
  );

  const totalCollected = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const uniquePayers   = new Set(payments.map(p => p.customerEmail ?? p.userId ?? p.reference)).size;

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Payments</h1>
          <p className="text-sm text-stone-400 mt-1">History of successful charges from Paystack</p>
        </div>
        <button onClick={() => load(1, false)} disabled={loading} className={`${BTN} shrink-0`}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary — over the payments currently loaded */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-7">
        {[
          { label: 'Payments shown', value: payments.length.toLocaleString(),            icon: <Receipt className="w-5 h-5" />,    color: 'brand' },
          { label: 'Total (shown)',  value: `₦${Math.round(totalCollected).toLocaleString()}`, icon: <DollarSign className="w-5 h-5" />, color: 'amber' },
          { label: 'Unique payers',  value: uniquePayers.toLocaleString(),               icon: <Users className="w-5 h-5" />,      color: 'blue'  },
        ].map(c => (
          <div key={c.label} className="card p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
              c.color === 'brand' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400' :
              c.color === 'blue'  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                                    'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
            }`}>{c.icon}</div>
            <p className="font-display font-extrabold text-xl text-stone-900 dark:text-stone-100">{c.value}</p>
            <p className="text-xs text-stone-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl mb-5 max-w-sm">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email, name or reference…"
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-stone-400 text-stone-900 dark:text-stone-100" />
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-stone-400 animate-pulse">Loading payments…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-stone-400">{error ? 'No payments to show.' : 'No payments yet'}</div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            <div className="grid grid-cols-12 min-w-[720px] gap-2 px-5 py-3 bg-stone-50 dark:bg-[#0a1628] text-xs font-bold uppercase tracking-wider text-stone-400">
              <div className="col-span-2">Date</div>
              <div className="col-span-4">Customer</div>
              <div className="col-span-2">Plan</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-2">Channel</div>
            </div>
            {filtered.map(p => (
              <div key={p.reference || `${p.customerEmail}-${p.paidAt}`}
                className="grid grid-cols-12 min-w-[720px] gap-2 px-5 py-3.5 items-center hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors">
                <div className="col-span-2 text-xs text-stone-500 dark:text-stone-400">{fmtDate(p.paidAt)}</div>
                <div className="col-span-4 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{p.customerName || '—'}</p>
                  <p className="text-xs text-stone-400 truncate">{p.customerEmail || p.reference}</p>
                </div>
                <div className="col-span-2">
                  <span className="badge bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400">
                    {p.plan ? (PLAN_LABEL[p.plan] ?? p.plan) : '—'}
                  </span>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {p.currency === 'NGN' ? '₦' : `${p.currency} `}{(p.amount ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 text-xs text-stone-400 capitalize">{p.channel || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination — disabled while a search filter is active, since search
          only spans the rows already loaded. */}
      {hasMore && !q && !loading && (
        <div className="text-center mt-5">
          <button onClick={() => load(page + 1, true)} disabled={loadingMore} className={BTN}>
            {loadingMore ? 'Loading…' : 'Load older payments'}
          </button>
        </div>
      )}
    </div>
  );
}
