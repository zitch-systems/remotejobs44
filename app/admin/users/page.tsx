'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Shield, Zap, User } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils';

interface Profile {
  id: string; name: string; email: string;
  plan: string; role: string; created_at: string;
}

export default function AdminUsersPage() {
  const supabase = createClient();
  const [users, setUsers]   = useState<Profile[]>([]);
  const [q, setQ]           = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setUsers(data ?? []); setLoading(false); });
  }, []);

  async function updatePlan(id: string, plan: string) {
    await supabase.from('profiles').update({ plan }).eq('id', id);
    setUsers(prev => prev.map(u => u.id === id ? { ...u, plan } : u));
  }

  const filtered = users.filter(u =>
    !q || u.name?.toLowerCase().includes(q.toLowerCase()) || u.email?.toLowerCase().includes(q.toLowerCase())
  );

  const planColor = (plan: string) => ({
    free: 'bg-stone-100 text-stone-600',
    daily: 'bg-blue-50 text-blue-700',
    pro: 'bg-amber-50 text-amber-700',
    admin: 'bg-brand-50 text-brand-700',
  }[plan] ?? 'bg-stone-100 text-stone-600');

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Users</h1>
          <p className="text-sm text-stone-400 mt-1">{users.length} total registered users</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-lg w-64">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total',     value: users.length,                              color: 'text-stone-700' },
          { label: 'Free',      value: users.filter(u => u.plan === 'free').length,  color: 'text-stone-500' },
          { label: 'Day Pass',  value: users.filter(u => u.plan === 'daily').length, color: 'text-blue-700' },
          { label: 'Pro',       value: users.filter(u => u.plan === 'pro').length,   color: 'text-amber-700' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`font-display font-extrabold text-2xl ${s.color}`}>{s.value}</p>
            <p className="text-xs text-stone-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-stone-400">Loading users…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-stone-400">No users found</div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            {/* Header */}
            <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-400">
              <div className="col-span-4">User</div>
              <div className="col-span-2">Plan</div>
              <div className="col-span-3">Joined</div>
              <div className="col-span-3">Actions</div>
            </div>
            {filtered.map(user => (
              <div key={user.id} className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xs font-black text-brand-700 shrink-0">
                    {(user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{user.name || '—'}</p>
                    <p className="text-xs text-stone-400 truncate">{user.email}</p>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className={`badge ${planColor(user.plan)}`}>
                    {user.plan === 'admin' ? <Shield className="w-3 h-3" /> : user.plan !== 'free' ? <Zap className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {user.plan}
                  </span>
                </div>
                <div className="col-span-3 text-xs text-stone-400">
                  {user.created_at ? formatRelativeDate(user.created_at) : '—'}
                </div>
                <div className="col-span-3">
                  <select
                    value={user.plan}
                    onChange={e => updatePlan(user.id, e.target.value)}
                    className="text-xs border border-stone-200 dark:border-[#1e3a5f] rounded-md px-2 py-1 bg-white dark:bg-[#0d1a2e] text-stone-700 dark:text-stone-300 cursor-pointer"
                  >
                    <option value="free">Free</option>
                    <option value="daily">Day Pass</option>
                    <option value="pro">Pro</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
