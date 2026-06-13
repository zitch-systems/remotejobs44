'use client';
// app/admin/agents/page.tsx — admin overview of all referral agents.
//
// One row per agent with their referral code + commission rate and headline
// performance (referred sign-ups, paying subscribers, charges, commission
// owed). The rate itself is edited on the per-user drill-in
// (/admin/users/[id]); this page is the at-a-glance roster + a link in.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, ExternalLink, Search } from 'lucide-react';
import { useUIStore } from '@/lib/store';

interface AgentRow {
  id: string;
  name: string | null;
  email: string;
  referral_code: string | null;
  commission_rate: number;
  suspended: boolean;
  created_at: string;
  signups: number;
  subscribers: number;
  charges: number;
  total_commission: number;
  unpaid_commission: number;
}

const naira = (n: number) => `₦${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AdminAgentsPage() {
  const { toast } = useUIStore();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/agents');
        const data = await res.json();
        if (res.ok) setAgents(data.agents ?? []);
        else toast(data.error ?? 'Failed to load agents', 'error');
      } catch {
        toast('Failed to load agents', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const filtered = agents.filter(a => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (a.name ?? '').toLowerCase().includes(needle)
      || a.email.toLowerCase().includes(needle)
      || (a.referral_code ?? '').toLowerCase().includes(needle);
  });

  const totals = agents.reduce((acc, a) => {
    acc.signups += a.signups; acc.subscribers += a.subscribers;
    acc.commission += a.total_commission; acc.unpaid += a.unpaid_commission;
    return acc;
  }, { signups: 0, subscribers: 0, commission: 0, unpaid: 0 });

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#2563eb' }}>
          <Megaphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 tracking-tight">Agents</h1>
          <p className="text-sm text-slate-400">Referral partners and their performance.</p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-6">
        Promote any user to an agent (and set their commission rate) from their{' '}
        <span className="font-medium text-slate-500 dark:text-slate-300">Users → user → Role</span> page.
      </p>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Agents" value={agents.length} />
        <Stat label="Referred sign-ups" value={totals.signups} />
        <Stat label="Paying subscribers" value={totals.subscribers} />
        <Stat label="Commission owed" value={naira(totals.unpaid)} />
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by name, email, or code…"
          className="input text-sm pl-9"
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-10 w-full rounded" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {agents.length === 0 ? 'No agents yet. Promote a user to an agent to get started.' : 'No agents match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-[#1e2d4a] bg-slate-50/50 dark:bg-[#0d1a2e]">
                  <th className="py-3 px-4 font-medium">Agent</th>
                  <th className="py-3 px-4 font-medium">Code</th>
                  <th className="py-3 px-4 font-medium text-right">Rate</th>
                  <th className="py-3 px-4 font-medium text-right">Sign-ups</th>
                  <th className="py-3 px-4 font-medium text-right">Subscribers</th>
                  <th className="py-3 px-4 font-medium text-right">Commission</th>
                  <th className="py-3 px-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className="border-b border-slate-50 dark:border-[#162033] last:border-0 hover:bg-slate-50/50 dark:hover:bg-[#0d1a2e] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        {a.name || a.email.split('@')[0]}
                        {a.suspended && <span className="badge bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">suspended</span>}
                      </div>
                      <div className="text-xs text-slate-400">{a.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{a.referral_code ?? '—'}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-700 dark:text-slate-200">{a.commission_rate}%</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-500 dark:text-slate-400">{a.signups}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-500 dark:text-slate-400">{a.subscribers}</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{naira(a.total_commission)}</span>
                      {a.unpaid_commission > 0 && (
                        <span className="block text-[10px] text-amber-600 dark:text-amber-400">{naira(a.unpaid_commission)} owed</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/admin/users/${a.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                        Manage <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <p className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
