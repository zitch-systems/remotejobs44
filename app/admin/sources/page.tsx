'use client';
// app/admin/sources/page.tsx — Source management, DB-backed.
//
// Sources live in the `job_sources` table. The daily cron at
// /api/cron/daily reads this list every 06:00 UTC and fetches each
// active row via lib/feed-parser (RSS or JSON auto-detected), inserting
// any returned jobs into the public `jobs` table.
//
// This page swaps the old localStorage store for the DB API. Admin
// changes here actually affect what the cron ingests.
import { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, RefreshCw, ExternalLink, Rss,
  Globe, Pause, Play, AlertCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourceRow {
  id:            string;
  name:          string;
  url:           string;
  method:        string;
  status:        'active' | 'paused' | 'error';
  last_sync_at:  string | null;
  jobs_added:    number;
  // Why the last run failed. The ingest has always written this column; the
  // API just never selected it, so an "Error" row gave the admin a red dot and
  // no way to find out what broke.
  error_message: string | null;
  created_at:    string;
}

const METHOD_META: Record<string, { label: string; color: string }> = {
  'rss':           { label: 'RSS',           color: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
  'json-api':      { label: 'JSON',          color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  'auto':          { label: 'Auto-detect',   color: 'text-stone-500 bg-stone-100 dark:bg-stone-800' },
  'scrape':        { label: 'HTML',          color: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/20' },
  'unknown':       { label: 'Unknown',       color: 'text-stone-500 bg-stone-100 dark:bg-stone-800' },
};

const PRESETS = [
  { name: 'We Work Remotely', url: 'https://weworkremotely.com/remote-jobs.rss' },
  { name: 'Remotive',         url: 'https://remotive.com/api/remote-jobs' },
  { name: 'Jobicy',           url: 'https://jobicy.com/api/v2/remote-jobs?count=50' },
  { name: 'Remote OK',        url: 'https://remoteok.com/remote-jobs.rss' },
  { name: 'Working Nomads',   url: 'https://www.workingnomads.com/jobs?format=rss' },
  { name: 'YC Hiring',        url: 'https://yc-oss.github.io/api/companies/hiring.json' },
  // WP Job Manager board — jobs live in the plugin's job_feed, not the
  // site's main /feed/. Page URLs from this site also work: the ingest
  // pipeline resolves HTML pages to this feed automatically.
  { name: "Sam's Social Media Club", url: 'https://www.samssocialmediaclub.com/feed/job_feed/?posts_per_page=50' },
];

export default function SourcesPage() {
  const [sources,  setSources]  = useState<SourceRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adding,   setAdding]   = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{
    totalAdded: number;
    results: Record<string, number | string>;
    paused?: string[];
    skipped?: boolean;
    reason?: string;
    // "Run now" also drives the JobSpy top-up and the ATS board sweep. Both
    // came back in the response and were dropped on the floor, so the ~34k ATS
    // postings — the bulk of the catalogue — refreshed with no feedback at all.
    jobspy?: { totalAdded?: number; skipped?: boolean; reason?: string };
    ats?: { boardsRefreshed?: number; added?: number; reactivated?: number; errors?: number; timedOut?: boolean; error?: string };
  } | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  async function loadSources() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/sources');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to load sources');
      setSources(j.sources ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSources(); }, []);

  async function handleAdd() {
    const url = urlInput.trim();
    if (!url) return;
    setAdding(true);
    try {
      const r = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name: nameInput.trim() || undefined, method: 'auto' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to add');
      setUrlInput('');
      setNameInput('');
      await loadSources();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleBulkAdd() {
    const urls = bulkText
      .split(/[\n,\s]+/)
      .map(u => u.trim())
      .filter(u => /^https?:\/\//.test(u));
    if (!urls.length) return;

    setBulkProgress({ done: 0, total: urls.length });
    setError(null);
    // Surface per-URL failures instead of swallowing them — a URL the API
    // rejects (SSRF guard, validation) otherwise just silently never
    // appears in the list and the admin assumes it was added.
    const failed: string[] = [];
    // Cap concurrency so we don't hammer the API or the SSRF guard
    const CONCURRENCY = 4;
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (url) => {
        try {
          const r = await fetch('/api/admin/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, method: 'auto' }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({} as { error?: string }));
            failed.push(j.error ? `${url} — ${j.error}` : url);
          }
        } catch {
          failed.push(url);
        }
        setBulkProgress(p => p ? { ...p, done: p.done + 1 } : null);
      }));
    }
    setBulkText('');
    setBulkProgress(null);
    if (failed.length) {
      setError(`Failed to add ${failed.length} of ${urls.length} URL(s): ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ` and ${failed.length - 3} more` : ''}`);
    }
    await loadSources();
  }

  async function handleTogglePause(source: SourceRow) {
    // 'error' resumes to 'active', it does not pause. The old ternary keyed
    // only off 'paused', so the one action available on a broken source was to
    // pause it — and since the ingest skipped non-active rows, an admin had no
    // way at all to put a recovered source back into the run.
    const next = source.status === 'active' ? 'paused' : 'active';
    try {
      const r = await fetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      // fetch only rejects on a network failure, so without this a 4xx/5xx
      // fell through to loadSources() and the row simply snapped back to its
      // old state with no explanation.
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error || `Failed to ${next === 'active' ? 'resume' : 'pause'} ${source.name}`);
      }
      setError(null);
      await loadSources();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(source: SourceRow) {
    if (!confirm(`Remove source "${source.name}"?\n\nThe cron stops fetching it. Jobs already ingested are kept.`)) return;
    try {
      await fetch(`/api/admin/sources/${source.id}`, { method: 'DELETE' });
      await loadSources();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleIngestNow() {
    setIngesting(true);
    setIngestResult(null);
    try {
      const r = await fetch('/api/admin/ingest-now', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'failed');
      setIngestResult({
        totalAdded: j.totalAdded ?? 0,
        results:    j.results ?? {},
        paused:     j.paused,
        skipped:    j.skipped,
        reason:     j.reason,
        jobspy:     j.jobspy,
        ats:        j.ats,
      });
      // Refresh the list so last_sync_at / jobs_added are current.
      await loadSources();
    } catch (err: any) {
      setIngestResult({ totalAdded: 0, results: { error: err.message } });
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <div className="mb-7">
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-1">Job Sources</h1>
        <p className="text-sm text-stone-400 dark:text-stone-500">
          The daily cron (06:00 UTC) fetches every active source below and inserts returned jobs. Pause to skip a source temporarily; delete to drop it.
        </p>
      </div>

      {error && (
        <div className="card p-3 mb-4 border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Run-now panel */}
      <div className="card p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-1">Run Ingest Now</h2>
            <p className="text-xs text-stone-400 dark:text-stone-500">
              Runs the same pipeline the cron runs at 06:00 UTC: hardcoded sources (Remotive, Jobicy, RemoteOK, Arbeitnow, WorkingNomads, Himalayas, Findwork/SerpApi if keyed) + every active row below, plus a short JobSpy top-up. JobSpy also runs on its own cron at 12:00 UTC and has its own console under Admin → JobSpy.
            </p>
            {ingestResult && (
              ingestResult.skipped ? (
                <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-400">
                  ⏳ {ingestResult.reason ?? 'Another ingest is already running. Try again in a few minutes.'}
                </div>
              ) : (
                <div className="mt-3 p-3 rounded-lg bg-stone-50 dark:bg-[#162033] text-xs">
                  <p className="font-bold text-brand-700 dark:text-brand-400 mb-1">Added {ingestResult.totalAdded} new jobs</p>
                  <ul className="space-y-0.5 text-stone-600 dark:text-stone-300">
                    {Object.entries(ingestResult.results).map(([k, v]) => (
                      <li key={k}><span className="font-semibold">{k}:</span> {String(v)}</li>
                    ))}
                  </ul>
                  {ingestResult.paused && ingestResult.paused.length > 0 && (
                    <p className="mt-1 text-stone-400">Paused: {ingestResult.paused.join(', ')}</p>
                  )}
                  {ingestResult.jobspy && (
                    <p className="mt-1 text-stone-600 dark:text-stone-300">
                      <span className="font-semibold">JobSpy:</span>{' '}
                      {ingestResult.jobspy.skipped
                        ? (ingestResult.jobspy.reason ?? 'skipped')
                        : `${ingestResult.jobspy.totalAdded ?? 0} added`}
                    </p>
                  )}
                  {ingestResult.ats && (
                    ingestResult.ats.error ? (
                      <p className="mt-1 text-red-600 dark:text-red-400">
                        <span className="font-semibold">ATS boards:</span> {ingestResult.ats.error}
                      </p>
                    ) : (
                      <p className="mt-1 text-stone-600 dark:text-stone-300">
                        <span className="font-semibold">ATS boards:</span>{' '}
                        {ingestResult.ats.boardsRefreshed ?? 0} refreshed · {ingestResult.ats.added ?? 0} added ·{' '}
                        {ingestResult.ats.reactivated ?? 0} reactivated
                        {ingestResult.ats.errors ? ` · ${ingestResult.ats.errors} failed` : ''}
                        {ingestResult.ats.timedOut ? ' · budget reached, more next run' : ''}
                      </p>
                    )
                  )}
                </div>
              )
            )}
          </div>
          <button onClick={handleIngestNow} disabled={ingesting}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors shrink-0">
            {ingesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {ingesting ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3">Add Source</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input ref={urlRef} type="url" value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Paste URL — RSS or JSON API"
            className="input flex-1 text-sm" />
          <input type="text" value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Label (optional)"
            className="input sm:w-44 text-sm" />
          <button onClick={handleAdd} disabled={!urlInput.trim() || adding}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.url} onClick={() => { setUrlInput(p.url); setNameInput(p.name); urlRef.current?.focus(); }}
                className="px-3 py-1.5 text-xs font-medium border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-500 dark:text-stone-400 hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk add */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Bulk Add URLs</h2>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Paste many URLs — one per line. Feed URLs (RSS / JSON) work directly; job-board pages are resolved to their feed at ingest time when the page advertises one (incl. WP Job Manager boards).</p>
          </div>
          {bulkProgress && (
            <span className="text-xs font-bold text-brand-700 dark:text-brand-400 shrink-0">{bulkProgress.done} / {bulkProgress.total}</span>
          )}
        </div>
        <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
          placeholder={'https://jobs.ashby.com/company-x\nhttps://company.greenhouse.io/boards/\nhttps://weworkremotely.com/remote-jobs.rss\n...'}
          rows={6}
          className="input text-sm font-mono resize-y mb-3"
          disabled={bulkProgress !== null} />
        {bulkProgress && (
          <div className="w-full bg-stone-100 dark:bg-[#162033] rounded-full h-1.5 mb-3 overflow-hidden">
            <div className="h-full bg-brand-600 rounded-full transition-all duration-300" style={{ width: `${(bulkProgress.done / Math.max(1, bulkProgress.total)) * 100}%` }} />
          </div>
        )}
        <button onClick={handleBulkAdd} disabled={!bulkText.trim() || bulkProgress !== null}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {bulkProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          {bulkProgress ? `Adding… ${bulkProgress.done}/${bulkProgress.total}` : 'Add All'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-12 text-center text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading sources…
        </div>
      ) : sources.length === 0 ? (
        <div className="card p-12 text-center">
          <Rss className="w-10 h-10 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
          <p className="font-bold text-stone-500 dark:text-stone-400 mb-1">No sources yet</p>
          <p className="text-sm text-stone-400 dark:text-stone-500">Add a URL above or pick a preset.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map(source => {
            const mm = METHOD_META[source.method] ?? METHOD_META.unknown;
            const isPaused = source.status === 'paused';
            const isError  = source.status === 'error';
            return (
              <div key={source.id} className="card p-4 flex items-center gap-3">
                <span className={cn('w-2 h-2 rounded-full shrink-0',
                  isPaused ? 'bg-amber-400' : isError ? 'bg-red-500' : 'bg-brand-500')}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-bold text-sm text-stone-900 dark:text-stone-100">{source.name}</span>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold', mm.color)}>
                      {mm.label}
                    </span>
                    {isPaused && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                        Paused
                      </span>
                    )}
                    {isError && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                        Error
                      </span>
                    )}
                    {source.jobs_added > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400">
                        {source.jobs_added} on last run
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 dark:text-stone-500 truncate">{source.url}</p>
                  {source.last_sync_at && (
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                      Synced {new Date(source.last_sync_at).toLocaleString()}
                    </p>
                  )}
                  {isError && source.error_message && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words" title={source.error_message}>
                      {source.error_message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a href={source.url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors"
                    title="Open source URL">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => handleTogglePause(source)}
                    className="p-1.5 rounded-md text-stone-400 hover:text-amber-600 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors"
                    aria-label={isPaused || isError ? `Resume ${source.name}` : `Pause ${source.name}`}
                    title={isPaused ? 'Resume' : isError ? 'Retry — clears the error and re-enables this source' : 'Pause'}>
                    {isPaused || isError ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleDelete(source)}
                    className="p-1.5 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    title="Delete source">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
