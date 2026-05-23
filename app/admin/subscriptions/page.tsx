'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DollarSign, TrendingUp, Calendar, Search } from 'lucide-react';
import { formatRelativeDate, formatNumber } from '@/lib/utils';

interface Sub {
  id: string; user_id: string; plan: string; billing: string;
  status: string; price: number; currency: string;
  current_period_start: string; current_period_end: string;
  profiles: { name: string; email: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  active:    'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400',
  cancelled: 'bg-stone-100 text-stone-500 dark:bg-stone-800',
  expired:   'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  past_due:  'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
};

export default function SubscriptionsPage() {
  const supabase = createClient();
  const [subs, setSubs]     = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]           = useState('');

  useEffect(() => {
    supabase
      .from('subscriptions')
      .select('*, profiles(name, email)')
      .order('current_period_start', { ascending: false })
      .then(({ data }) => { setSubs((data ?? []) as Sub[]); setLoading(false); });
  }, []);

  const filtered = subs.filter(s =>
    !q ||
    s.profiles?.email?.toLowerCase().includes(q.toLowerCase()) ||
    s.profiles?.name?.toLowerCase().includes(q.toLowerCase())
  );

  const active    = subs.filter(s => s.status === 'active');
  const mrr       = active.reduce((sum, s) => sum + (s.billing === 'annually' ? (s.price ?? 0) / 12 : (s.price ?? 0)), 0);
  const arr       = mrr * 12;
  const daily     = active.filter(s => s.billing === 'daily').length;
  const monthly   = active.filter(s => s.billing === 'monthly').length;
  const annual    = active.filter(s => s.billing === 'annually').length;

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="mb-7">
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Subscriptions</h1>
        <p className="text-sm text-stone-400 mt-1">Revenue and subscriber management</p>
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Active Subs',  value: active.length,            icon: <TrendingUp className="w-5 h-5" />, color: 'brand' },
          { label: 'Est. MRR',     value: `₦${formatNumber(mrr)}`,  icon: <DollarSign className="w-5 h-5" />, color: 'amber' },
          { label: 'Est. ARR',     value: `₦${formatNumber(arr)}`,  icon: <Calendar className="w-5 h-5" />,   color: 'blue'  },
          { label: 'Day / Mo / Yr',value: `${daily}/${monthly}/${annual}`, icon: <TrendingUp className="w-5 h-5" />, color: 'amber' },
        ].map(c => (
          <div key={c.label} className="card p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
              c.color === 'brand' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400' :
              c.color === 'green' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' :
              c.color === 'blue'  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                                    'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
            }`}>{c.icon}</div>
            <p className="font-display font-extrabold text-xl text-stone-900 dark:text-stone-100">{c.value}</p>
            <p className="text-xs text-stone-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl mb-5 max-w-sm">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by email or name…"
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-stone-400 text-stone-900 dark:text-stone-100" />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-stone-400 animate-pulse">Loading subscriptions…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-stone-400">No subscriptions yet</div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-stone-50 dark:bg-[#0a1628] text-xs font-bold uppercase tracking-wider text-stone-400">
              <div className="col-span-4">User</div>
              <div className="col-span-2">Plan</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Renews</div>
            </div>
            {filtered.map(sub => (
              <div key={sub.id} className="grid grid-cols-12 gap-2 px-5 py-3.5 items-center hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors">
                <div className="col-span-4 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{sub.profiles?.name || '—'}</p>
                  <p className="text-xs text-stone-400 truncate">{sub.profiles?.email}</p>
                </div>
                <div className="col-span-2">
                  <span className="badge bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 capitalize">
                    {sub.plan}
                  </span>
                  <p className="text-[10px] text-stone-400 mt-0.5 capitalize">{sub.billing}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    ₦{(sub.price ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className={`badge ${STATUS_COLOR[sub.status] ?? STATUS_COLOR.expired}`}>
                    {sub.status}
                  </span>
                </div>
                <div className="col-span-2 text-xs text-stone-400">
                  {sub.current_period_end ? formatRelativeDate(sub.current_period_end) : '—'}