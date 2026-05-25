'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Search, Shield, Zap, User, ArrowUpDown, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { cn, formatRelativeDate } from '@/lib/utils';

interface Profile {
  id: string; name: string | null; email: string;
  plan: string; role: string; created_at: string;
  suspended?: boolean | null;
}

type PlanFilter = 'all' | 'free' | 'daily' | 'pro' | 'admin';
type SortBy     = 'newest' | 'oldest' | 'name' | 'plan';

const PAGE_SIZE = 25;

// Sort orderings — keyed off Supabase column names so we can pass them
// directly to .order().
const SORT_FIELDS: Record<SortBy, { col: string; asc: boolean }> = {
  newest: { col: 'created_at', asc: false },
  oldest: { col: 'created_at', asc: true  },
  name:   { col: 'name',       asc: true  },
  plan:   { col: 'plan',       asc: true  },
};

export default function AdminUsersPage() {
  const supabase = createClient();
  const [users,   setUsers]   = useState<Profile[]>([]);
  const [total,   setTotal]   = useState(0);
  const [planTotals, setPlanTotals] = useState({ free: 0, daily: 0, pro: 0, admin: 0 });
  const [loading, setLoading] = useState(true);

  const [q,      setQ]      = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [plan,   setPlan]   = useState<PlanFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [page,   setPage]   = useState(1);

  // Debounce search so we don't fire a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 when any filter changes — otherwise a filter could leave
  // you on page 5 of a 2-page result set and show "no users".
  useEffect(() => { setPage(1); }, [debouncedQ, plan, sortBy]);

  const load = useCallback(async () => {
    setLoading(true);
    const { col, asc } = SORT_FIELDS[sortBy];
    let query = supabase
      .from('profiles')
      // suspended is added in migration_v4 — Supabase ignores unknown columns
      // in the select list on older schemas, so this is forward-compatible.
      .select('id,name,email,plan,role,created_at,suspended', { count: 'exact' })
      .order(col, { ascending: asc, nullsFirst: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (plan !== 'all') query = query.eq('plan', plan);
    if (debouncedQ) {
      // ilike with % wildcards on both sides — case-insensitive substring match.
      const like = `%${debouncedQ}%`;
      query = query.or(`name.ilike.${like},email.ilike.${like}`);
    }

    const { data, count, error } = await query;
    if (!error) {
      setUsers((data ?? []) as Profile[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [debouncedQ, plan, sortBy, page, supabase]);

  useEffect(() => { load(); }, [load]);

  // Plan counts: cheap separate queries, one per tier. Refreshed alongside
  // the main list so the filter chips reflect the current truth.
  useEffect(() => {
    async function loadPlanTotals() {
      const tiers: Array<keyof typeof planTotals> = ['free', 'daily', 'pro', 'admin'];
      const results = await Promise.all(tiers.map(t =>
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', t)
          .then(({ count }) => [t, count ?? 0] as const)
      ));
      setPlanTotals(Object.fromEntries(results) as typeof planTotals);
    }
    loadPlanTotals();
  }, [supabase]);

  const planColor = (p: string) => ({
    free:  'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    daily: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
    pro:   'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
    admin: 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400',
  }[p] ?? 'bg-stone-100 text-stone-600');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Users</h1>
          <p className="text-sm text-stone-400 mt-1">
            {total.toLocaleString()} total · showing {users.length} on page {page} of {totalPages}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-lg w-64">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or email…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400" />
        </div>
      </div>

      {/* Filter chips — clickable to filter, with live counts */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          { id: 'all',   label: 'All',      count: planTotals.free + planTotals.daily + planTotals.pro + planTotals.admin },
          { id: 'free',  label: 'Free',     count: planTotals.free  },
          { id: 'daily', label: 'Day Pass', count: planTotals.daily },
          { id: 'pro',   label: 'Pro',      count: planTotals.pro   },
          { id: 'admin', label: 'Admin',    count: planTotals.admin },
        ] as const).map(chip => (
          <button key={chip.id} onClick={() => setPlan(chip.id as PlanFilter)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
              plan === chip.id
                ? 'bg-brand-700 text-white dark:bg-brand-500'
                : 'bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#1e3a5f]'
            )}>
            {chip.label}
            <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]',
              plan === chip.id ? 'bg-white/20' : 'bg-stone-200 dark:bg-stone-700'
            )}>{chip.count}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
            className="text-xs border border-stone-200 dark:border-[#1e3a5f] rounded-md px-2 py-1.5 bg-white dark:bg-[#0d1a2e] text-stone-700 dark:text-stone-300 cursor-pointer">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A→Z</option>
            <option value="plan">Plan</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 animate-pulse space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-12 rounded" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-400">
            No users match these filters.
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-400">
              <div className="col-span-5">User</div>
              <div className="col-span-2">Plan</div>
              <div className="col-span-3">Joined</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {users.map(user => (
              <div key={user.id}
                className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                <Link href={`/admin/users/${user.id}`}
                  className="col-span-5 flex items-center gap-3 min-w-0 group">
                  <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xs font-black text-brand-700 shrink-0">
                    {(user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                      {user.name || '—'}
                    </p>
                    <p className="text-xs text-stone-400 truncate">{user.email}</p>
                  </div>
                </Link>
                <div className="col-span-2 flex flex-wrap items-center gap-1">
                  <span className={cn('badge', planColor(user.plan))}>
                    {user.plan === 'admin' ? <Shield className="w-3 h-3" /> :
                     user.plan !== 'free' ? <Zap className="w-3 h-3" /> :
                     <User className="w-3 h-3" />}
                    {user.plan}
                  </span>
                  {user.suspended && (
                    <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                      suspended
                    </span>
                  )}
                </div>
                <div className="col-span-3 text-xs text-stone-400">
                  {user.created_at ? formatRelativeDate(user.created_at) : '—'}
                </div>
                <div className="col-span-2 flex justify-end">
                  <Link href={`/admin/users/${user.id}`}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                    View <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 gap-3">
          <p className="text-xs text-stone-400">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-stone-200 dark:border-[#1e3a5f] text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-stone-200 dark:border-[#1e3a5f] text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
