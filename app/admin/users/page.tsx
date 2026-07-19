'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Shield, Zap, User, ArrowUpDown, ChevronLeft, ChevronRight, ExternalLink, X, AlertTriangle, Loader2 } from 'lucide-react';
import { cn, formatRelativeDate } from '@/lib/utils';
import { useUIStore } from '@/lib/store';

interface Profile {
  id: string; name: string | null; email: string;
  plan: string; role: string; created_at: string;
  suspended?: boolean | null;
}

type PlanFilter = 'all' | 'free' | 'daily' | 'pro' | 'admin';
type SortBy     = 'newest' | 'oldest' | 'name' | 'plan';

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
  const { toast } = useUIStore();
  const [users,   setUsers]   = useState<Profile[]>([]);
  const [total,   setTotal]   = useState(0);
  const [planTotals, setPlanTotals] = useState({ free: 0, daily: 0, pro: 0, admin: 0 });
  const [loading, setLoading] = useState(true);

  const [q,      setQ]      = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [plan,   setPlan]   = useState<PlanFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [page,   setPage]   = useState(1);

  // Bulk selection — Set so individual row toggles don't re-render the
  // whole table on every check.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'idle' | 'suspending' | 'unsuspending' | 'setting_plan' | 'deleting'>('idle');
  const selectedCount = selected.size;
  const allOnPageSelected = users.length > 0 && users.every(u => selected.has(u.id));

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePageAll() {
    setSelected(prev => {
      const next = new Set(prev);
      const allOn = users.every(u => next.has(u.id));
      for (const u of users) {
        if (allOn) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function runBulk(action: 'suspend' | 'unsuspend' | 'set_plan' | 'delete', extra?: { plan?: string; reason?: string }) {
    if (selectedCount === 0) return;
    const ids = Array.from(selected);
    // Confirm destructive paths in the UI; the server also guards
    // against the calling admin's own id.
    if (action === 'delete') {
      if (!confirm(`Permanently delete ${ids.length} user account${ids.length === 1 ? '' : 's'}?\n\nThis cascades through profiles, applications, saved_jobs, subscriptions — and can't be undone.`)) return;
    }
    if (action === 'suspend' && !extra?.reason) {
      // prompt() returns null when the user clicks Cancel and '' when
      // they hit OK with an empty box. Distinguish: null = "I changed
      // my mind, don't run the suspend at all"; '' = "no reason
      // needed, proceed with empty reason".
      const reason = prompt('Optional suspension reason (visible to other admins in the audit log):');
      if (reason === null) return;
      extra = { reason };
    }
    setBulkAction(action === 'suspend' ? 'suspending'
      : action === 'unsuspend' ? 'unsuspending'
      : action === 'set_plan'  ? 'setting_plan'
      : 'deleting');
    try {
      const res = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userIds: ids, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Bulk operation failed');
      // Summarise the outcome — bulk delete returns per-id results.
      if (action === 'delete') {
        toast(`Deleted ${data.succeeded} of ${data.target_count}${data.failed ? ` (${data.failed} failed)` : ''}`, data.failed ? 'error' : 'success', 5000);
      } else if (action === 'set_plan') {
        toast(`Plan updated for ${data.affected} of ${data.target_count}`, 'success', 4000);
      } else {
        toast(`${action === 'suspend' ? 'Suspended' : 'Unsuspended'} ${data.affected} of ${data.target_count}`, 'success', 4000);
      }
      clearSelection();
      load();
    } catch (err: any) {
      toast(err?.message ?? 'Bulk operation failed', 'error', 5000);
    } finally {
      setBulkAction('idle');
    }
  }

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
    try {
      // Server-side list (service_role behind requireAdmin) so the page works
      // for ANY admin — including hardcoded-email admins whose profiles.role
      // isn't 'admin', who would otherwise be blocked by the profiles RLS
      // policy on a direct browser query. Mirrors /api/admin/stats.
      const params = new URLSearchParams({
        plan, sort: sortBy, page: String(page), pageSize: String(PAGE_SIZE),
      });
      if (debouncedQ) params.set('q', debouncedQ);
      const res  = await fetch(`/api/admin/users?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setUsers((data.users ?? []) as Profile[]);
        setTotal(data.total ?? 0);
        if (data.planTotals) setPlanTotals(data.planTotals);
      }
    } catch {
      /* keep previous state on a transient failure */
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, plan, sortBy, page]);

  useEffect(() => { load(); }, [load]);

  // Plan totals (filter-chip counts) come back with the list response from
  // /api/admin/users and are applied in load() above.

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

      {/* Bulk action toolbar — appears whenever ≥1 row is checked */}
      {selectedCount > 0 && (
        <div className="card p-3 mb-5 flex flex-wrap items-center gap-3 border-brand-200 dark:border-brand-900/40 bg-brand-50/40 dark:bg-brand-900/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-800 dark:text-brand-300">
            <span className="px-2 py-0.5 rounded-full bg-brand-700 text-white text-xs">{selectedCount}</span>
            selected
          </div>
          <button onClick={clearSelection}
            className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={() => runBulk('suspend')} disabled={bulkAction !== 'idle'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-60 transition-colors">
              {bulkAction === 'suspending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              Suspend
            </button>
            <button onClick={() => runBulk('unsuspend')} disabled={bulkAction !== 'idle'}
              className="px-3 py-1.5 rounded-md border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-60 transition-colors flex items-center gap-1.5">
              {bulkAction === 'unsuspending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Unsuspend
            </button>
            <div className="flex items-center gap-1">
              <select id="bulk-plan"
                className="text-xs border border-stone-200 dark:border-[#1e3a5f] rounded-md px-2 py-1.5 bg-white dark:bg-[#0d1a2e] text-stone-700 dark:text-stone-300"
                disabled={bulkAction !== 'idle'}
                onChange={e => { if (e.target.value) { runBulk('set_plan', { plan: e.target.value }); e.target.value = ''; } }}
                defaultValue="">
                <option value="" disabled>Set plan…</option>
                <option value="free">Free</option>
                <option value="daily">Day Pass</option>
                <option value="pro">Pro</option>
              </select>
              {bulkAction === 'setting_plan' && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />}
            </div>
            <button onClick={() => runBulk('delete')} disabled={bulkAction !== 'idle'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 transition-colors">
              {bulkAction === 'deleting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
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
            <div className="grid grid-cols-12 min-w-[720px] gap-3 px-5 py-3 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-400 items-center">
              <div className="col-span-1 flex items-center">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allOnPageSelected}
                  onChange={togglePageAll}
                  className="w-4 h-4 rounded border-stone-300 dark:border-[#1e3a5f] text-brand-700 focus:ring-brand-600 cursor-pointer"
                />
              </div>
              <div className="col-span-4">User</div>
              <div className="col-span-2">Plan</div>
              <div className="col-span-3">Joined</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {users.map(user => (
              <div key={user.id}
                className={cn(
                  'grid grid-cols-12 min-w-[720px] gap-3 px-5 py-3 items-center transition-colors',
                  selected.has(user.id)
                    ? 'bg-brand-50/40 dark:bg-brand-900/10'
                    : 'hover:bg-stone-50 dark:hover:bg-[#162033]'
                )}>
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${user.email}`}
                    checked={selected.has(user.id)}
                    onChange={() => toggleRow(user.id)}
                    className="w-4 h-4 rounded border-stone-300 dark:border-[#1e3a5f] text-brand-700 focus:ring-brand-600 cursor-pointer"
                  />
                </div>
                <Link href={`/admin/users/${user.id}`}
                  className="col-span-4 flex items-center gap-3 min-w-0 group">
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
