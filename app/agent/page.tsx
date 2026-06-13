'use client';
// app/agent/page.tsx — the agent's referral dashboard.
//
// Shows the agent's shareable link plus the four numbers they care about —
// clicks, sign-ups, paying subscribers, and commission earned — followed by a
// plan-mix breakdown and a recent-conversions table. No CV / AI tools here:
// an agent's job is to promote the platform, not to job-hunt. All data comes
// from /api/agent/stats (agent-only, service-role aggregated).
import { useEffect, useState } from 'react';
import {
  MousePointerClick, Users, BadgeCheck, Wallet, Copy, Check,
  Link2, Info, TrendingUp,
} from 'lucide-react';
import { useUIStore } from '@/lib/store';

interface PlanRow { plan: string; count: number; gross: number; commission: number; }
interface RecentRow {
  plan: string; billing: string | null; amount: number;
  commission_amount: number; commission_rate: number; status: string; created_at: string;
}
interface Stats {
  referralCode: string | null;
  commissionRate: number;
  clicks: number;
  signups: number;
  subscriptions: number;
  subscribers: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  planBreakdown: PlanRow[];
  recent: RecentRow[];
}

const naira = (n: number) => `₦${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const planLabel = (p: string) => (p === 'daily' ? 'Day Pass' : p === 'pro' ? 'Pro' : p || '—');
const billingLabel = (b: string | null) =>
  b === 'annually' ? 'Annual' : b === 'monthly' ? 'Monthly' : b === 'daily' ? 'Day' : (b ?? '—');

export default function AgentPortalPage() {
  const { toast } = useUIStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    (async () => {
      setOrigin(window.location.origin);
      try {
        const res = await fetch('/api/agent/stats');
        if (res.ok) setStats(await res.json());
        else toast('Could not load your stats. Please refresh.', 'error');
      } catch {
        toast('Could not load your stats. Please refresh.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const referralLink = stats?.referralCode ? `${origin}/r/${stats.referralCode}` : '';

  async function copyLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast('Referral link copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy failed — select and copy manually.', 'error');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const rate = stats?.commissionRate ?? 0;

  const cards = [
    { label: 'Link clicks',   value: stats?.clicks ?? 0,        icon: MousePointerClick, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' },
    { label: 'Sign-ups',      value: stats?.signups ?? 0,       icon: Users,             tone: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400' },
    { label: 'Subscribers',   value: stats?.subscribers ?? 0,   icon: BadgeCheck,        tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' },
    { label: 'Commission',    value: naira(stats?.totalCommission ?? 0), icon: Wallet,   tone: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div>
        <h1 className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 tracking-tight">
          Your referral dashboard
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Share your link, bring people to RemoteJobs44, and earn{' '}
          {rate > 0
            ? <strong className="text-slate-700 dark:text-slate-200">{rate}%</strong>
            : 'a commission'} on every subscription they pay for.
        </p>
      </div>

      {/* Referral link */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3 text-slate-900 dark:text-slate-100">
          <Link2 className="w-4 h-4 text-brand-600" />
          <h2 className="font-bold text-sm">Your referral link</h2>
        </div>
        {stats?.referralCode ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly value={referralLink}
              onFocus={e => e.currentTarget.select()}
              className="input text-sm flex-1 font-mono"
            />
            <button onClick={copyLink}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition-colors shrink-0">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your referral link is being set up. Check back shortly, or contact support if it doesn&apos;t appear.
          </p>
        )}
        <p className="text-xs text-slate-400 mt-3 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Post it on your page, bio, or chats. Anyone who signs up within 30 days of clicking is counted as yours.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card p-5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${tone}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Commission summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-slate-400 mb-1">Your commission rate</p>
          <p className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100">{rate}%</p>
          {rate === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              Not set yet — your conversions are tracked and your rate applies to future payments once an admin sets it.
            </p>
          )}
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-400 mb-1">Pending payout</p>
          <p className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100">{naira(stats?.pendingCommission ?? 0)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Earned, awaiting payout.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-400 mb-1">Paid out</p>
          <p className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100">{naira(stats?.paidCommission ?? 0)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Settled to date.</p>
        </div>
      </div>

      {/* Plan breakdown */}
      {(stats?.planBreakdown?.length ?? 0) > 0 && (
        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4 text-slate-900 dark:text-slate-100">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            <h2 className="font-bold text-sm">Subscriptions by plan</h2>
          </div>
          <div className="space-y-2">
            {stats!.planBreakdown.map(row => (
              <div key={row.plan} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#1e2d4a] last:border-0">
                <div className="flex items-center gap-2">
                  <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">{planLabel(row.plan)}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{row.count} {row.count === 1 ? 'payment' : 'payments'}</span>
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{naira(row.commission)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent conversions */}
      <div className="card p-5 sm:p-6">
        <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-4">Recent conversions</h2>
        {(stats?.recent?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            No subscriptions yet. Share your link to get started — conversions show up here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-[#1e2d4a]">
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Billing</th>
                  <th className="py-2 pr-4 font-medium text-right">Amount</th>
                  <th className="py-2 pr-4 font-medium text-right">Your cut</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats!.recent.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-[#162033] last:border-0">
                    <td className="py-2.5 pr-4"><span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{planLabel(r.plan)}</span></td>
                    <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400">{billingLabel(r.billing)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500 dark:text-slate-400">{naira(r.amount)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">{naira(r.commission_amount)}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`badge ${
                        r.status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : r.status === 'reversed' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                      }`}>{r.status}</span>
                    </td>
                    <td className="py-2.5 text-right text-slate-400 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="card p-5 sm:p-6 bg-slate-50/60 dark:bg-[#0d1a2e]">
        <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3">How it works</h2>
        <ol className="space-y-2 text-sm text-slate-500 dark:text-slate-400 list-decimal list-inside">
          <li>Share your referral link anywhere you have an audience.</li>
          <li>People who click are remembered for 30 days. When they create an account, they&apos;re counted as your sign-up.</li>
          <li>When one of your sign-ups buys a Day Pass or Pro plan, you earn your set percentage of that payment.</li>
          <li>Commission accrues here as “pending”, then moves to “paid” once it&apos;s settled to you.</li>
        </ol>
      </div>
    </div>
  );
}
