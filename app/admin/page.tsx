'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Users, TrendingUp, DollarSign, Rss, PlusCircle, RefreshCw, ArrowRight, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeDate, formatNumber } from '@/lib/utils';
import { MOCK_JOBS } from '@/lib/mock-data';

interface Stats { jobs: number; users: number; pro: number; daily: number; mrr: number; }

export default function AdminPage() {
  const supabase = createClient();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ count: jobCount }, { data: profiles }] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profiles').select('plan'),
      ]);
      const pro   = profiles?.filter(p => p.plan === 'pro').length   ?? 0;
      const daily = profiles?.filter(p => p.plan === 'daily').length  ?? 0;
      const mrr   = pro * 8999 + daily * 1000 * 4;
      setStats({ jobs: jobCount ?? MOCK_JOBS.length, users: profiles?.length ?? 0, pro, daily, mrr });
      setLoading(false);
    }
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch('/api/cron/ingest');
      const data = await res.json();
      setSyncResult(`✅ Synced! ${data.totalAdded} new jobs added.`);
    } catch {
      setSyncResult('❌ Sync failed. Check console.');
    }
    setSyncing(false);
  }

  const cards = stats ? [
    { label: 'Total Jobs',    value: formatNumber(stats.jobs),    icon: <Briefcase className="w-5 h-5" />,  color: 'brand', href: '/admin/jobs' },
    { label: 'Total Users',   value: formatNumber(stats.users),   icon: <Users className="w-5 h-5" />,      color: 'blue',  href: '/admin/users' },
    { label: 'Pro + Daily',   value: formatNumber(stats.pro + stats.daily), icon: <TrendingUp className="w-5 h-5" />, color: 'amber', href: '/admin/analytics' },
    { label: 'Est. MRR (₦)', value: `₦${formatNumber(stats.mrr)}`, icon: <DollarSign className="w-5 h-5" />, color: 'green', href: '/admin/analytics' },
  ] : [];

  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400',
    blue:  'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  };

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Admin Overview</h1>
          <p className="text-sm text-stone-400 mt-1">Live data from your Supabase database</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 border border-stone-200 dark:border-[#234533] text-stone-600 dark:text-stone-300 rounded-lg text-sm font-semibold hover:bg-stone-50 dark:hover:bg-[#1C3829] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Jobs Now'}
          </button>
          <Link href="/admin/jobs/new"
            className="flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white rounded-lg text-sm font-bold hover:bg-brand-600 transition-colors">
            <PlusCircle className="w-4 h-4" /> Post Job
          </Link>
        </div>
      </div>

      {syncResult && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-stone-50 dark:bg-[#1C3829] border border-stone-200 dark:border-[#234533] text-sm text-stone-700 dark:text-stone-300">
          {syncResult}
        </div>
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {cards.map(c => (
            <Link key={c.label} href={c.href} className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 transition-colors group">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[c.color]}`}>{c.icon}</div>
              <p className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100">{c.value}</p>
              <p className="text-xs text-stone-400 mt-0.5 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">{c.label} →</p>
            </Link>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { title: 'Add Job Sources',   desc: 'Add RSS feeds or ATS URLs to auto-import jobs',     href: '/admin/sources',        icon: <Rss className="w-5 h-5" /> },
          { title: 'Bulk Company Import', desc: 'Paste 500 career page URLs and detect ATS',       href: '/admin/company-import', icon: <Zap className="w-5 h-5" /> },
          { title: 'Manage Users',      desc: 'View users, upgrade plans, search accounts',         href: '/admin/users',          icon: <Users className="w-5 h-5" /> },
        ].map(a => (
          <Link key={a.href} href={a.href} className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
            <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 flex items-center justify-center mb-3">{a.icon}</div>
            <p className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">{a.title}</p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">{a.desc}</p>
          </Link>
        ))}
      </div>

      {/* Recent jobs */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-[#234533]">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Recent Jobs</h2>
          <Link href="/admin/jobs" className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1">
            Manage all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {MOCK_JOBS.slice(0, 5).map(job => (
          <div key={job.id} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors border-b border-stone-50 dark:border-[#1C3829] last:border-0">
            <div className="w-8 h-8 rounded-md bg-stone-100 dark:bg-[#1C3829] flex items-center justify-center text-xs font-black text-brand-700 shrink-0">{job.logo}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
              <p className="text-xs text-stone-400">{job.company} · {formatRelativeDate(job.posted)}</p>
            </div>
            <Link href={`/jobs/${job.id}`} className="text-xs text-brand-700 dark:text-brand-400 hover:underline shrink-0">View</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
