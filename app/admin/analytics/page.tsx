'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, Users, DollarSign, Briefcase, Eye, MousePointerClick } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export default function AdminAnalyticsPage() {
  const [counts, setCounts] = useState({ users: 0, pro: 0, daily: 0, free: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The previous implementation called
    //   supabase.from('profiles').select('plan')
    // from the browser client. PostgREST caps responses at db-max-rows
    // (1000) regardless of the client limit, so as soon as the user
    // base crossed 1k the page started lying about totals + MRR (only
    // the first 1000 rows were filter-counted). Route through
    // /api/admin/stats which does the head-count under service_role on
    // the server — same source the /admin overview already uses.
    async function load() {
      try {
        const res = await fetch('/api/admin/stats', { cache: 'no-store' });
        if (!res.ok) throw new Error(`stats ${res.status}`);
        const data = await res.json();
        const users = Number(data.activeUsers ?? 0);
        const pro   = Number(data.pro         ?? 0);
        const daily = Number(data.daily       ?? 0);
        setCounts({
          users,
          pro,
          daily,
          // Free is everyone who isn't paid / admin. The stats route
          // doesn't expose an admin count yet, so this matches what the
          // /admin overview shows.
          free:    Math.max(0, users - pro - daily),
          revenue: Number(data.mrr ?? 0),
        });
      } catch {
        setCounts({ users: 0, pro: 0, daily: 0, free: 0, revenue: 0 });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const cards = [
    { label: 'Total Users',    value: formatNumber(counts.users),    icon: <Users className="w-5 h-5" />,          color: 'brand' },
    { label: 'Pro Subscribers',value: formatNumber(counts.pro),      icon: <TrendingUp className="w-5 h-5" />,     color: 'amber' },
    { label: 'Day Pass Users', value: formatNumber(counts.daily),    icon: <MousePointerClick className="w-5 h-5" />, color: 'blue' },
    { label: 'Est. MRR (₦)',   value: `₦${formatNumber(counts.revenue)}`, icon: <DollarSign className="w-5 h-5" />, color: 'amber' },
  ];

  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
    blue:  'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    green: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  };

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Analytics</h1>
        <p className="text-sm text-stone-400 mt-1">Live data from your Supabase database</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-lg" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {cards.map(c => (
              <div key={c.label} className="card p-5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[c.color]}`}>
                  {c.icon}
                </div>
                <p className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100">{c.value}</p>
                <p className="text-xs text-stone-400 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Plan breakdown */}
          <div className="card p-6 mb-6">
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4">Plan Distribution</h2>
            <div className="space-y-3">
              {[
                { label: 'Free',     value: counts.free,  total: counts.users, color: 'bg-stone-300 dark:bg-stone-600' },
                { label: 'Day Pass', value: counts.daily, total: counts.users, color: 'bg-blue-400 dark:bg-blue-500' },
                { label: 'Pro',      value: counts.pro,   total: counts.users, color: 'bg-amber-400 dark:bg-amber-500' },
              ].map(row => {
                const pct = counts.users > 0 ? Math.round((row.value / counts.users) * 100) : 0;
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-stone-700 dark:text-stone-300">{row.label}</span>
                      <span className="text-stone-400">{row.value} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${row.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5 bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
            <p className="text-sm font-semibold text-brand-700 dark:text-brand-400 mb-1">💡 To improve conversion</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {counts.free > 0 && counts.pro + counts.daily === 0
                ? 'No paid users yet. Share your site and consider running a launch promotion.'
                : `${Math.round(((counts.pro + counts.daily) / counts.users) * 100)}% conversion rate. Industry average is 2-5%.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
