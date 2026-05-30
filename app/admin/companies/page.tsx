'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Building2, RefreshCw, Search, ExternalLink, Briefcase,
  CheckCircle, AlertCircle, ArrowUpDown, Trash2,
} from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { cn, formatRelativeDate } from '@/lib/utils';

interface CompanyRow {
  company: string;
  platform: string;
  slug: string;
  source: string;
  source_url: string | null;
  apply_url_sample: string | null;
  active_count: number;
  inactive_count: number;
  last_updated: string;
}

type SortBy = 'vacancies' | 'name' | 'last_updated';

const PLATFORM_COLORS: Record<string, string> = {
  greenhouse:      'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400',
  lever:           'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  ashby:           'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  workable:        'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400',
  recruitee:       'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  workday:         'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
  smartrecruiters: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  personio:        'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400',
  bamboohr:        'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-400',
  jazzhr:          'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  breezy:          'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  comeet:          'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400',
  jobvite:         'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
  icims:           'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400',
  recruiterbox:    'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/20 dark:text-fuchsia-400',
  jobscore:        'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  zohorecruit:     'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  teamtailor:      'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  manatal:         'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  pinpoint:        'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
  jobadder:        'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  talentlyft:      'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400',
  heyrecruit:      'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  vivahr:          'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  polymer:         'bg-slate-50 text-slate-700 dark:bg-slate-900/20 dark:text-slate-400',
  taleo:           'bg-stone-50 text-stone-700 dark:bg-stone-900/20 dark:text-stone-400',
  successfactors:  'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  // "25 more" batch
  bullhorn:        'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  crelate:         'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400',
  newton:          'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  cornerstone:     'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
  ukgpro:          'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  adp:             'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
  paylocity:       'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400',
  loxo:            'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  vincere:         'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  avature:         'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400',
  eightfold:       'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/20 dark:text-fuchsia-400',
  phenom:          'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400',
  beamery:         'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  hireology:       'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-400',
  clearcompany:    'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  hrpartner:       'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  recooty:         'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400',
  skeeled:         'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  hibob:           'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  pcrecruiter:     'bg-stone-50 text-stone-700 dark:bg-stone-900/20 dark:text-stone-400',
  catsone:         'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  recruitcrm:      'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  sagepeople:      'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  workzoom:        'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
  hireserve:       'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
  unknown:         'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  manual:          'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
};

export default function AdminCompaniesPage() {
  const { toast } = useUIStore();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [q,         setQ]         = useState('');
  const [platform,  setPlatform]  = useState<string>('all');
  const [sortBy,    setSortBy]    = useState<SortBy>('vacancies');
  // Track per-company refresh state — multiple can be in flight at once.
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [removing, setRemoving]     = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // cache: 'no-store' so the page doesn't serve a stale (e.g. 0
    // companies, pre-deploy) response right after a bulk import.
    const res = await fetch('/api/admin/companies', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setCompanies(data.companies ?? []);
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Failed to load companies', 'error');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function refreshOne(row: CompanyRow): Promise<{ added: number; removed: number; reactivated: number } | null> {
    setRefreshing(prev => new Set(prev).add(row.company));
    try {
      const res = await fetch('/api/admin/companies/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company:          row.company,
          platform:         row.platform,
          slug:             row.slug,
          apply_url_sample: row.apply_url_sample,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(`${row.company}: ${data.error ?? 'refresh failed'}`, 'error', 5000);
        return null;
      }
      // Patch the local row optimistically — saves a full reload after each refresh.
      setCompanies(prev => prev.map(c => c.company === row.company ? {
        ...c,
        active_count:  c.active_count + (data.added ?? 0) + (data.reactivated ?? 0) - (data.removed ?? 0),
        inactive_count: c.inactive_count + (data.removed ?? 0) - (data.reactivated ?? 0),
        last_updated:  new Date().toISOString(),
      } : c));
      return { added: data.added ?? 0, removed: data.removed ?? 0, reactivated: data.reactivated ?? 0 };
    } catch (err: any) {
      toast(`${row.company}: ${err.message ?? 'refresh failed'}`, 'error');
      return null;
    } finally {
      setRefreshing(prev => {
        const next = new Set(prev); next.delete(row.company); return next;
      });
    }
  }

  async function handleRefreshOne(row: CompanyRow) {
    const res = await refreshOne(row);
    if (res) {
      toast(`${row.company}: +${res.added} new, ${res.removed} expired${res.reactivated ? `, ${res.reactivated} reactivated` : ''}`, 'success', 4500);
    }
  }

  async function handleRemove(row: CompanyRow) {
    if (!confirm(
      `Remove "${row.company}" from the live job list?\n\n` +
      `This soft-deletes ${row.active_count} active job(s) — they'll stay in the DB for user application history, ` +
      `but won't show up in public search until you Refresh the company.`
    )) return;
    setRemoving(row.company);
    try {
      const res = await fetch('/api/admin/companies/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: row.company }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? 'Remove failed', 'error'); return; }
      // Optimistic local update — move all active rows to inactive count.
      setCompanies(prev => prev.map(c => c.company === row.company ? {
        ...c,
        inactive_count: c.inactive_count + c.active_count,
        active_count:   0,
        last_updated:   new Date().toISOString(),
      } : c));
      toast(`${row.company}: removed ${data.removed} job(s)`, 'success', 4500);
    } catch (err: any) {
      toast(err.message ?? 'Remove failed', 'error');
    } finally {
      setRemoving(null);
    }
  }

  async function handleRefreshAll() {
    const eligible = filtered.filter(c => c.platform !== 'unknown' && c.platform !== 'manual' && c.slug);
    if (eligible.length === 0) {
      toast('No refreshable companies in the current view', 'info');
      return;
    }
    if (!confirm(`Refresh ${eligible.length} companies? This can take a minute.`)) return;

    setBulkRefreshing(true);
    let totals = { added: 0, removed: 0, reactivated: 0, ok: 0, fail: 0 };
    // 3 at a time to avoid hammering any one ATS or eating Vercel function time.
    const CONCURRENCY = 3;
    for (let i = 0; i < eligible.length; i += CONCURRENCY) {
      const batch = eligible.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(refreshOne));
      for (const r of results) {
        if (r) {
          totals.ok++;
          totals.added += r.added;
          totals.removed += r.removed;
          totals.reactivated += r.reactivated;
        } else {
          totals.fail++;
        }
      }
    }
    setBulkRefreshing(false);
    toast(
      `Bulk refresh: +${totals.added} new · ${totals.removed} expired${totals.reactivated ? ` · ${totals.reactivated} reactivated` : ''} · ${totals.fail} failed`,
      totals.fail > 0 ? 'info' : 'success',
      6000,
    );
  }

  // ── Filter chips: distinct platforms with counts ───────────────────────
  const platformCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of companies) m[c.platform] = (m[c.platform] ?? 0) + 1;
    return m;
  }, [companies]);

  const filtered = useMemo(() => {
    let list = companies;
    if (platform !== 'all') list = list.filter(c => c.platform === platform);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(c => c.company.toLowerCase().includes(needle) || c.slug.toLowerCase().includes(needle));
    }
    const sorted = [...list];
    if (sortBy === 'vacancies') sorted.sort((a, b) => b.active_count - a.active_count);
    else if (sortBy === 'name') sorted.sort((a, b) => a.company.localeCompare(b.company));
    else sorted.sort((a, b) => (b.last_updated ?? '').localeCompare(a.last_updated ?? ''));
    return sorted;
  }, [companies, q, platform, sortBy]);

  const totalVacancies = companies.reduce((s, c) => s + c.active_count, 0);

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-600" /> Scraped Companies
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            {companies.length} companies · {totalVacancies.toLocaleString()} active vacancies
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={load} disabled={loading || bulkRefreshing}
            className="flex items-center gap-2 px-3 py-2 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 text-sm font-semibold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-50 transition-colors">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Reload
          </button>
          <button onClick={handleRefreshAll} disabled={loading || bulkRefreshing || companies.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            <RefreshCw className={cn('w-4 h-4', bulkRefreshing && 'animate-spin')} />
            {bulkRefreshing ? 'Refreshing…' : 'Refresh visible'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-lg w-64">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search company or slug…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
            className="text-xs border border-stone-200 dark:border-[#1e3a5f] rounded-md px-2 py-1.5 bg-white dark:bg-[#0d1a2e] text-stone-700 dark:text-stone-300 cursor-pointer">
            <option value="vacancies">Most vacancies</option>
            <option value="name">Name A→Z</option>
            <option value="last_updated">Recently updated</option>
          </select>
        </div>
      </div>

      {/* Platform chips */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setPlatform('all')}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
            platform === 'all'
              ? 'bg-brand-700 text-white dark:bg-brand-500'
              : 'bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#1e3a5f]'
          )}>
          All ({companies.length})
        </button>
        {Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).map(([p, count]) => (
          <button key={p} onClick={() => setPlatform(p)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-bold transition-colors capitalize',
              platform === p
                ? 'bg-brand-700 text-white dark:bg-brand-500'
                : 'bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#1e3a5f]'
            )}>
            {p} ({count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 animate-pulse space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-400">
            {companies.length === 0
              ? 'No scraped companies yet. Run a bulk import from /admin/company-import.'
              : 'No companies match these filters.'}
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-400">
              <div className="col-span-4">Company</div>
              <div className="col-span-2">Platform</div>
              <div className="col-span-2 text-right">Active</div>
              <div className="col-span-2">Last sync</div>
              <div className="col-span-2 text-right">Action</div>
            </div>
            {filtered.map(row => {
              const isRefreshing = refreshing.has(row.company);
              const isManual     = row.platform === 'manual';
              const isUnknown    = row.platform === 'unknown' || !row.slug;
              return (
                <div key={row.company}
                  className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                  <div className="col-span-4 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{row.company}</p>
                    {row.slug && <p className="text-xs text-stone-400 font-mono truncate">{row.slug}</p>}
                  </div>
                  <div className="col-span-2">
                    <span className={cn('badge capitalize',
                      PLATFORM_COLORS[row.platform] ?? PLATFORM_COLORS.unknown
                    )}>
                      {row.platform}
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      {row.active_count}
                    </p>
                    {row.inactive_count > 0 && (
                      <p className="text-[10px] text-stone-400">{row.inactive_count} closed</p>
                    )}
                  </div>
                  <div className="col-span-2 text-xs text-stone-400">
                    {formatRelativeDate(row.last_updated)}
                  </div>
                  <div className="col-span-2 flex justify-end items-center gap-1">
                    {row.apply_url_sample && (
                      <a href={row.apply_url_sample} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors"
                        title="Open a sample job">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => handleRefreshOne(row)}
                      disabled={isRefreshing || isManual || isUnknown || bulkRefreshing || removing === row.company}
                      title={
                        isManual  ? 'Manually posted — no source to refresh' :
                        isUnknown ? 'No detected ATS — open a sample apply URL to see why' :
                                    'Re-scrape this company and reconcile vacancies'
                      }
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                        isRefreshing
                          ? 'bg-stone-100 dark:bg-[#162033] text-stone-500'
                          : 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/30'
                      )}>
                      {isRefreshing
                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> …</>
                        : <><RefreshCw className="w-3 h-3" /> Refresh</>}
                    </button>
                    <button
                      onClick={() => handleRemove(row)}
                      disabled={removing === row.company || isRefreshing || bulkRefreshing || row.active_count === 0}
                      title={row.active_count === 0
                        ? 'No active jobs to remove'
                        : 'Soft-delete all active jobs for this company (preserves user history)'}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {removing === row.company
                        ? <RefreshCw className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <p className="text-xs text-stone-400 mt-4 flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5" />
        Refresh re-scrapes the company&rsquo;s ATS. New roles get inserted, removed roles are marked closed (kept in DB so user application history stays intact).
      </p>
    </div>
  );
}
