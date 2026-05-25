'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Users, TrendingUp, DollarSign, Rss, PlusCircle, RefreshCw, ArrowRight, Zap, Search, Activity, CheckCircle, AlertCircle, Shield, Globe, Trash2, Star, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeDate, formatNumber, CATEGORY_META } from '@/lib/utils';
import { jobsApi } from '@/lib/api';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { Job } from '@/lib/types';

interface Stats {
  jobs:    number;
  users:   number;
  pro:     number;
  daily:   number;
  mrr:     number;
  newToday: number;
  // 30-day signup trend: one bucket per day, oldest first.
  signups30d: number[];
}

// Plan prices in NGN, from app/pricing/page.tsx. Pro Annual amortised to
// monthly so it contributes the right amount to MRR (₦29,999 / 12 ≈ ₦2,500).
// Day Pass is one-off so we don't include it in *monthly* recurring revenue.
const PRO_MONTHLY_NGN   = 2999;
const PRO_ANNUAL_MONTHLY_NGN = Math.round(29999 / 12); // 2500

export default function AdminPage() {
  const supabase = createClient();
  const { toast } = useUIStore();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [health, setHealth] = useState<{ db: boolean; api: boolean; paystack: boolean } | null>(null);

  useEffect(() => {
    async function load() {
      const since30d = new Date();
      since30d.setDate(since30d.getDate() - 29);
      since30d.setHours(0, 0, 0, 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [{ count: jobCount }, { data: profiles }, { count: newTodayCount }, { data: activeSubs }] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profiles').select('plan,created_at').gte('created_at', since30d.toISOString()),
        supabase.from('jobs').select('*', { count: 'exact', head: true })
          .eq('is_active', true).gte('posted_at', todayStart.toISOString()),
        // MRR comes from the subscriptions table — that's the only place that
        // knows monthly vs annual billing. profiles.plan='pro' doesn't tell us
        // whether the user is on a ₦2,999/mo or ₦29,999/yr plan.
        supabase.from('subscriptions')
          .select('plan,billing,price')
          .eq('status', 'active'),
      ]).catch(() => [{ count: null }, { data: null }, { count: null }, { data: null }] as any);

      // Plan-tier counts come from the ALL profiles query (not the 30-day
      // window above), so refetch the plan totals cheaply.
      const { data: allPlans } = await supabase.from('profiles').select('plan');
      const pro   = allPlans?.filter((p: any) => p.plan === 'pro').length   ?? 0;
      const daily = allPlans?.filter((p: any) => p.plan === 'daily').length ?? 0;

      // Sum monthly-equivalent revenue from each active subscription. Day
      // passes are one-off charges — they boost cash flow but aren't MRR.
      let mrr = 0;
      for (const s of (activeSubs ?? [])) {
        if (s.billing === 'annually') {
          mrr += Math.round((s.price ?? PRO_ANNUAL_MONTHLY_NGN * 12) / 12);
        } else if (s.billing === 'monthly') {
          mrr += s.price ?? PRO_MONTHLY_NGN;
        }
        // daily intentionally excluded
      }
      // Fallback when no subscriptions rows yet — estimate from profiles plan.
      if (mrr === 0 && pro > 0) mrr = pro * PRO_MONTHLY_NGN;

      // 30-day signup sparkline buckets (oldest → newest)
      const buckets: number[] = Array(30).fill(0);
      for (const p of (profiles ?? [])) {
        const d = new Date(p.created_at);
        const dayIndex = Math.floor((d.getTime() - since30d.getTime()) / 86_400_000);
        if (dayIndex >= 0 && dayIndex < 30) buckets[dayIndex]++;
      }

      setStats({
        jobs:       jobCount ?? 0,
        users:      allPlans?.length ?? 0,
        pro,
        daily,
        mrr,
        newToday:   newTodayCount ?? 0,
        signups30d: buckets,
      });
      setLoading(false);
      setHealth({ db: jobCount !== null, api: true, paystack: !!process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY });
    }
    load();

    // Recent jobs panel — show real DB rows, not the dev fixtures.
    jobsApi.getJobs({ perPage: 8, sort: 'newest' })
      .then(r => { setRecentJobs(r.jobs); setJobsLoading(false); })
      .catch(() => setJobsLoading(false));
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

  const filteredJobs = recentJobs.filter(j =>
    !jobSearch || j.title.toLowerCase().includes(jobSearch.toLowerCase()) || j.company.toLowerCase().includes(jobSearch.toLowerCase())
  );

  async function handleDeleteJob(id: string) {
    if (!confirm('Delete this job?')) return;
    await jobsApi.deleteJob(id);
    setRecentJobs(prev => prev.filter(j => j.id !== id));
    toast('Job deleted', 'success');
  }

  async function handleToggleFeatured(job: any) {
    await jobsApi.updateJob(job.id, { featured: !job.featured });
    setRecentJobs(prev => prev.map(j => j.id === job.id ? { ...j, featured: !j.featured } : j));
  }

  const cards = stats ? [
    { label: 'Total Jobs',    value: formatNumber(stats.jobs),    sub: `+${stats.newToday} today`, icon: <Briefcase className="w-5 h-5" />,  color: 'brand', href: '/admin/jobs' },
    { label: 'Total Users',   value: formatNumber(stats.users),   sub: 'registered accounts', icon: <Users className="w-5 h-5" />,      color: 'blue',  href: '/admin/users' },
    { label: 'Paid Users',    value: formatNumber(stats.pro + stats.daily), sub: `${stats.pro} pro · ${stats.daily} day`, icon: <TrendingUp className="w-5 h-5" />, color: 'amber', href: '/admin/subscriptions' },
    { label: 'Est. MRR (₦)', value: `₦${formatNumber(stats.mrr)}`, sub: 'monthly recurring', icon: <DollarSign className="w-5 h-5" />, color: 'green', href: '/admin/analytics' },
  ] : [];

  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400',
    blue:  'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
    green: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
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
            className="flex items-center gap-2 px-4 py-2 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 rounded-lg text-sm font-semibold hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-50 transition-colors">
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
        <div className="mb-5 px-4 py-3 rounded-lg bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] text-sm text-stone-700 dark:text-stone-300">
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
              <p className="text-xs text-stone-400 mt-0.5 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">{c.sub}</p>
              <p className="text-xs font-semibold text-brand-700 dark:text-brand-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">{c.label} →</p>
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

      {/* 30-day signup sparkline */}
      {stats && stats.signups30d.some(n => n > 0) && (
        <div className="card p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-600" /> Signups — last 30 days
            </h2>
            <p className="text-xs text-stone-400">
              {stats.signups30d.reduce((a, b) => a + b, 0)} total ·
              last 7d: {stats.signups30d.slice(-7).reduce((a, b) => a + b, 0)}
            </p>
          </div>
          <Sparkline values={stats.signups30d} />
        </div>
      )}

      {/* System Health */}
      {health && (
        <div className="card p-5 mb-8">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-brand-600" /> System Health</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Database', ok: health.db, icon: <Globe className="w-4 h-4" /> },
              { label: 'API Routes', ok: health.api, icon: <Zap className="w-4 h-4" /> },
              { label: 'Paystack', ok: health.paystack, icon: <Shield className="w-4 h-4" /> },
            ].map(item => (
              <div key={item.label} className={cn('flex items-center gap-2 p-3 rounded-lg border text-sm font-semibold',
                item.ok
                  ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400'
                  : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400'
              )}>
                {item.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{item.label}</span>
                <span className="ml-auto text-xs font-normal">{item.ok ? 'OK' : 'Error'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent jobs with search + bulk actions */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-[#1e3a5f] gap-3 flex-wrap">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Recent Jobs</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Inline job search */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-sm">
              <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <input value={jobSearch} onChange={e => setJobSearch(e.target.value)} placeholder="Filter jobs…"
                className="bg-transparent border-none outline-none text-sm w-36 placeholder:text-stone-400 text-stone-700 dark:text-stone-300" />
            </div>
            <Link href="/admin/jobs" className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1">
              Manage all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-400">
          <div className="col-span-6">Job</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-2">Posted</div>
          <div className="col-span-2">Actions</div>
        </div>
        {jobsLoading && (
          <div className="px-5 py-8">
            <div className="animate-pulse space-y-3">
              {[1,2,3].map(i => <div key={i} className="skeleton h-12 rounded" />)}
            </div>
          </div>
        )}
        {!jobsLoading && filteredJobs.slice(0, 8).map(job => {
          const cat = CATEGORY_META[job.category as keyof typeof CATEGORY_META] ?? CATEGORY_META['other'];
          return (
            <div key={job.id} className="flex sm:grid sm:grid-cols-12 gap-2 items-center px-5 py-3 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors border-b border-stone-50 dark:border-[#162033] last:border-0">
              <div className="flex items-center gap-3 min-w-0 sm:col-span-6 flex-1">
                <div className="w-8 h-8 rounded-md bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-xs font-black text-brand-700 shrink-0">{job.logo}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
                    {job.featured && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-stone-400">{job.company}</p>
                </div>
              </div>
              <div className="hidden sm:block sm:col-span-2">
                <span className={cn('badge text-[10px]', cat.color)}>{cat.icon} {cat.label}</span>
              </div>
              <div className="hidden sm:block sm:col-span-2 text-xs text-stone-400">{formatRelativeDate(job.posted)}</div>
              <div className="flex items-center gap-1.5 sm:col-span-2 shrink-0">
                <Link href={`/jobs/${job.id}`} target="_blank"
                  className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                </Link>
                <button onClick={() => handleToggleFeatured(job)}
                  className={cn('p-1.5 rounded-md transition-colors', job.featured ? 'text-amber-500' : 'text-stone-400 hover:text-amber-500')}>
                  <Star className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDeleteJob(job.id)}
                  className="p-1.5 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {!jobsLoading && filteredJobs.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-stone-400">
            {recentJobs.length === 0 ? 'No jobs in the database yet — run a sync.' : 'No jobs match your search.'}
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny dependency-free sparkline. Renders one bar per value, scaled to the
// max value in the series. A flat zero series renders as a faint baseline.
function Sparkline({ values, height = 56 }: { values: number[]; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {values.map((v, i) => {
        const pct = (v / max) * 100;
        return (
          <div
            key={i}
            title={`Day ${i + 1}: ${v}`}
            className="flex-1 rounded-t-sm bg-brand-500/80 dark:bg-brand-400/80 transition-all hover:bg-brand-600 dark:hover:bg-brand-300"
            style={{ height: `${Math.max(pct, 2)}%`, minWidth: 4 }}
          />
        );
      })}
    </div>
  );
}
