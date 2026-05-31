'use client';
// app/admin/audit/page.tsx
//
// Read-only viewer for the admin_actions audit log. Every admin
// route under /api/admin/* writes to this table on success — this
// page is where staff actually look at the trail.
//
// Filters:
//   * action       — exact match from a dropdown of distinct values
//   * adminEmail   — case-insensitive substring
//   * targetType   — exact match from the allow-listed types
//   * since        — datetime-local input (24h, last 7d, last 30d quick chips)
//
// Layout choice: a single table on desktop, a stack of cards on
// mobile. Metadata is JSON so we just <pre> it inside an expandable
// row — copy-pasting it into a ticket is the dominant workflow.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, ShieldCheck } from 'lucide-react';
import { cn, formatRelativeDate } from '@/lib/utils';

interface Row {
  id:           string;
  admin_id:     string | null;
  admin_email:  string | null;
  action:       string;
  target_type:  string | null;
  target_id:    string | null;
  metadata:     Record<string, unknown> | null;
  created_at:   string;
}

const ACTION_OPTIONS = [
  'company.refresh',
  'company.remove',
  'ats.bulk_import',
  'ingest.run_now',
  'job.create', 'job.update', 'job.delete',
  'source.create', 'source.update', 'source.delete',
  'user.update_plan', 'user.update_role', 'user.update_name',
  'user.suspend', 'user.unsuspend', 'user.reset_password',
  'user.restore_subscription', 'user.delete',
  'ai_provider.update', 'ai_provider.delete',
  'ai.discovery_query',
  'settings.update',
];

const TARGET_OPTIONS = ['user', 'job', 'company', 'source', 'site_settings', 'ai_provider', 'subscription'];

const SINCE_CHIPS: Array<{ label: string; hours: number }> = [
  { label: 'Last 24h', hours: 24 },
  { label: 'Last 7d',  hours: 24 * 7 },
  { label: 'Last 30d', hours: 24 * 30 },
];

function isoSince(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [action,     setAction]     = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId,   setTargetId]   = useState('');
  const [since,      setSince]      = useState('');
  // Tracks which "since" chip the user picked, so the chip stays
  // highlighted regardless of how long the user has been on the
  // page. Previously derived the active-chip state from comparing
  // `since` to (now - chip.hours), which drifted after 60s and
  // visually un-highlighted the chip while the filter still
  // applied. Decouple the visual state from wall-clock time.
  const [activeSinceChip, setActiveSinceChip] = useState<number | null>(null);
  const [page,       setPage]       = useState(1);

  const qs = useMemo(() => {
    const s = new URLSearchParams();
    if (action)     s.set('action',     action);
    if (adminEmail) s.set('adminEmail', adminEmail);
    if (targetType) s.set('targetType', targetType);
    if (targetId)   s.set('targetId',   targetId);
    if (since)      s.set('since',      since);
    s.set('page',    String(page));
    s.set('perPage', '25');
    return s.toString();
  }, [action, adminEmail, targetType, targetId, since, page]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/audit?${qs}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotal(Number(data.total ?? 0));
        setPages(Number(data.pages ?? 1));
      } catch {
        if (!cancelled) { setRows([]); setTotal(0); setPages(1); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [qs]);

  // Resetting any filter snaps back to page 1 so the user doesn't end
  // up on a phantom page-5 of a 1-page filter result.
  useEffect(() => { setPage(1); }, [action, adminEmail, targetType, targetId, since]);

  function resetFilters() {
    setAction(''); setAdminEmail(''); setTargetType(''); setTargetId(''); setSince(''); setActiveSinceChip(null); setPage(1);
  }

  const anyFilter = !!(action || adminEmail || targetType || targetId || since);

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-brand-700 dark:text-brand-400" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Audit Log</h1>
            <p className="text-sm text-stone-400 mt-0.5">
              {total.toLocaleString()} actions {anyFilter ? 'matching filter' : 'recorded'} ·
              page {page} of {pages}
            </p>
          </div>
        </div>
        {anyFilter && (
          <button onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* Filter grid */}
      <div className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Action</label>
          <select value={action} onChange={e => setAction(e.target.value)}
            className="input text-sm w-full">
            <option value="">All actions</option>
            {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Admin email</label>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-md">
            <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
              placeholder="substring…"
              className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Target type</label>
          <select value={targetType} onChange={e => setTargetType(e.target.value)}
            className="input text-sm w-full">
            <option value="">Any target</option>
            {TARGET_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Target id</label>
          <input value={targetId} onChange={e => setTargetId(e.target.value)}
            placeholder="exact id…"
            className="input text-sm w-full" />
        </div>
      </div>

      {/* Since chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-xs text-stone-400">Since:</span>
        {SINCE_CHIPS.map(c => {
          const isActive = activeSinceChip === c.hours;
          return (
            <button key={c.label}
              onClick={() => {
                if (isActive) {
                  setSince(''); setActiveSinceChip(null);
                } else {
                  setSince(isoSince(c.hours)); setActiveSinceChip(c.hours);
                }
              }}
              className={cn('px-2.5 py-1 rounded-full text-xs font-bold transition-colors',
                isActive
                  ? 'bg-brand-700 text-white dark:bg-brand-500'
                  : 'bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#1e3a5f]'
              )}>
              {c.label}
            </button>
          );
        })}
        {since && (
          <button onClick={() => { setSince(''); setActiveSinceChip(null); }}
            className="text-xs text-stone-400 hover:text-stone-600 underline">
            clear
          </button>
        )}
      </div>

      {/* Rows */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 animate-pulse space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-400">
            No audit actions match these filters.
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-400">
              <div className="col-span-3">When</div>
              <div className="col-span-3">Admin</div>
              <div className="col-span-3">Action</div>
              <div className="col-span-3">Target</div>
            </div>
            {rows.map(r => {
              const isOpen = expanded === r.id;
              // Only act on click when there's metadata to expand. The
              // chevron in the right column gets hidden too so the
              // row reads correctly as "no further detail" instead of
              // a broken click target.
              const hasMetadata = !!(r.metadata && Object.keys(r.metadata).length > 0);
              return (
                <div key={r.id}
                  className={cn(
                    'px-4 py-3 transition-colors',
                    hasMetadata
                      ? 'hover:bg-stone-50 dark:hover:bg-[#162033] cursor-pointer'
                      : 'cursor-default',
                  )}
                  onClick={hasMetadata ? () => setExpanded(isOpen ? null : r.id) : undefined}>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-3 text-xs text-stone-500">
                      <div className="text-stone-700 dark:text-stone-300 font-semibold">
                        {formatRelativeDate(r.created_at)}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="md:col-span-3 text-xs text-stone-600 dark:text-stone-300 truncate">
                      {r.admin_email ?? <em className="text-stone-400">no email</em>}
                    </div>
                    <div className="md:col-span-3 text-xs">
                      <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">{r.action}</span>
                    </div>
                    <div className="md:col-span-3 text-xs text-stone-500 flex items-center gap-1 min-w-0">
                      {r.target_type ? (
                        <>
                          <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[10px] font-semibold uppercase">{r.target_type}</span>
                          <span className="truncate">{r.target_id ?? '—'}</span>
                        </>
                      ) : <em className="text-stone-400">no target</em>}
                      {hasMetadata && (
                        <ChevronDown className={cn('w-3.5 h-3.5 ml-auto shrink-0 text-stone-400 transition-transform', isOpen && 'rotate-180')} />
                      )}
                    </div>
                  </div>
                  {isOpen && r.metadata && Object.keys(r.metadata).length > 0 && (
                    <pre className="mt-3 p-3 rounded bg-stone-50 dark:bg-[#0a1628] text-[11px] text-stone-700 dark:text-stone-300 overflow-x-auto max-h-60 whitespace-pre-wrap break-words">
{JSON.stringify(r.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-5 gap-3">
          <p className="text-xs text-stone-400">Page {page} of {pages}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-stone-200 dark:border-[#1e3a5f] text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-stone-200 dark:border-[#1e3a5f] text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-stone-400 text-center mt-6">
        <Link href="/admin" className="hover:underline">← Back to admin overview</Link>
      </p>
    </div>
  );
}
