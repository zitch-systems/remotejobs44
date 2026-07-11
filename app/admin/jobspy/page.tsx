'use client';
// app/admin/jobspy/page.tsx
// JobSpy console — search LinkedIn / Indeed / ZipRecruiter / Google Jobs
// through the JobSpy API service, list every job it returns, then import the
// ones you want into the public jobs table. The daily cron also ingests
// JobSpy automatically (lib/ingest-pipeline.ts); this page is the on-demand,
// review-before-import surface.
import { useEffect, useRef, useState } from 'react';
import {
  Radar, Search, Play, Download, Save, Trash2, Globe, MapPin, Clock,
  BarChart2, ExternalLink, Loader2, CheckCircle, AlertCircle, Info, List,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSafeOpenUrl } from '@/lib/safe-url';

type JobSpyJob = {
  title: string;
  company: string;
  location: string;
  type: string;
  category: string;
  level: string;
  description: string;
  applyUrl: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  remote: boolean;
  source: string;
  site: string;
  sourceUrl: string;
  posted: string;
};

type Result = JobSpyJob & { _id: string; saved?: boolean };

type Config = {
  configured: boolean;
  host: string | null;
  hasKey: boolean;
  sites: string[];
  queries: string[];
};

// Board toggles. Keys are JobSpy site identifiers; Glassdoor is intentionally
// absent (excluded product-wide).
const SITE_OPTIONS: { key: string; label: string }[] = [
  { key: 'indeed',        label: 'Indeed' },
  { key: 'linkedin',      label: 'LinkedIn' },
  { key: 'zip_recruiter', label: 'ZipRecruiter' },
  { key: 'google',        label: 'Google Jobs' },
];

function fmtSalary(j: JobSpyJob): string | null {
  if (!j.salaryMin && !j.salaryMax) return null;
  const cur = j.currency || 'USD';
  const n = (v: number) => v.toLocaleString();
  if (j.salaryMin && j.salaryMax) return `${cur} ${n(j.salaryMin)}–${n(j.salaryMax)}`;
  return `${cur} ${n((j.salaryMin ?? j.salaryMax) as number)}`;
}

export default function JobSpyPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Search form
  const [searchTerm, setSearchTerm] = useState('remote software engineer');
  const [location, setLocation] = useState('');
  const [sites, setSites] = useState<string[]>(['indeed', 'linkedin', 'zip_recruiter', 'google']);
  const [resultsWanted, setResultsWanted] = useState(40);
  const [hoursOld, setHoursOld] = useState(0);
  const [remoteOnly, setRemoteOnly] = useState(true);

  // Results / status
  const [jobs, setJobs] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [filterSite, setFilterSite] = useState('');
  const idRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/jobspy');
        const j = await r.json();
        if (!cancelled && r.ok) setConfig(j);
      } catch { /* leave config null → generic hint */ }
      finally { if (!cancelled) setConfigLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggleSite(key: string) {
    setSites(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  }

  async function runSearch() {
    const term = searchTerm.trim();
    if (!term) { setError('Enter a search term.'); return; }
    setSearching(true);
    setError(null);
    setImportResult(null);
    try {
      const r = await fetch('/api/admin/jobspy/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchTerm: term,
          location: location.trim() || undefined,
          sites,
          resultsWanted,
          hoursOld: hoursOld > 0 ? hoursOld : undefined,
          isRemote: remoteOnly,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const rows: Result[] = (j.jobs ?? []).map((job: JobSpyJob) => ({ ...job, _id: `js_${idRef.current++}`, saved: false }));
      setJobs(rows);
      if (rows.length === 0) setError('JobSpy returned no jobs for that search. Try a broader term or more boards.');
    } catch (err: any) {
      setError(err.message);
      setJobs([]);
    } finally {
      setSearching(false);
    }
  }

  async function importAll() {
    const unsaved = jobs.filter(j => !j.saved);
    if (unsaved.length === 0) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const payload = unsaved.map(j => ({
        title: j.title,
        company: j.company,
        logo: j.company[0]?.toUpperCase() ?? '?',
        category: j.category,
        type: j.type,
        level: j.level,
        salaryMin: j.salaryMin ?? undefined,
        salaryMax: j.salaryMax ?? undefined,
        currency: j.currency,
        location: j.location,
        description: j.description,
        applyUrl: j.applyUrl,
        posted: j.posted,
        source: 'jobspy',
        sourceUrl: j.sourceUrl,
        remote: j.remote,
        isNew: true,
      }));

      let inserted = 0, skipped = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const batch = payload.slice(i, i + 500);
        const r = await fetch('/api/ats/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobs: batch }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `Save failed (HTTP ${r.status})`);
        inserted += data.inserted ?? 0;
        skipped  += data.skipped  ?? 0;
      }
      setImportResult({ inserted, skipped });
      setJobs(prev => prev.map(j => ({ ...j, saved: true })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function exportCSV() {
    const rows = [
      ['Title', 'Company', 'Location', 'Type', 'Category', 'Level', 'Salary', 'Board', 'Apply URL', 'Posted'],
      ...jobs.map(j => [j.title, j.company, j.location, j.type, j.category, j.level, fmtSalary(j) ?? '', j.site, j.applyUrl, j.posted]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jobspy-${searchTerm.replace(/\s+/g, '-')}.csv`;
    a.click();
  }

  const notConfigured = config !== null && !config.configured;
  const sitesInResults = Array.from(new Set(jobs.map(j => j.site))).sort();
  const filteredJobs = filterSite ? jobs.filter(j => j.site === filterSite) : jobs;
  const unsavedCount = jobs.filter(j => !j.saved).length;

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight flex items-center gap-2 mb-1">
            <Radar className="w-6 h-6 text-brand-600" />
            JobSpy
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">
            Search LinkedIn, Indeed, ZipRecruiter &amp; Google Jobs, then import into the platform.
            {config?.host && <span className="ml-1 text-stone-400">Connected to <span className="font-mono">{config.host}</span>.</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {jobs.length > 0 && (
            <>
              <button onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <button onClick={importAll} disabled={importing || unsavedCount === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Save className="w-4 h-4" /> Import {unsavedCount} to platform</>}
              </button>
            </>
          )}
          <button onClick={runSearch} disabled={searching || notConfigured}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-brand-700 dark:bg-brand-600 text-white rounded-lg hover:bg-brand-800 transition-colors disabled:opacity-40">
            {searching ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching…</> : <><Play className="w-4 h-4" /> Search</>}
          </button>
        </div>
      </div>

      {/* Not-configured hint */}
      {notConfigured && (
        <div className="card p-4 mb-5 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-900/10">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-bold mb-1">JobSpy isn&apos;t connected yet</p>
              <p className="text-amber-700 dark:text-amber-400/90">
                Deploy a JobSpy API service (the FastAPI wrapper around <span className="font-mono">python-jobspy</span>),
                then set <span className="font-mono">JOBSPY_API_URL</span> (and optionally <span className="font-mono">JOBSPY_API_KEY</span>) in
                the environment and redeploy. Search and daily ingest activate automatically once the URL is set.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error / import banners */}
      {error && (
        <div className="card p-3 mb-4 border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {importResult && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-sm">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <span className="font-semibold text-green-700 dark:text-green-400">{importResult.inserted} jobs imported</span>
          {importResult.skipped > 0 && <span className="text-stone-400">· {importResult.skipped} already in the platform</span>}
        </div>
      )}

      {/* Search configuration */}
      <div className="card p-5 mb-6">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-brand-600" /> Search
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5 block">Search term</label>
            <input type="text" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="e.g. remote product manager"
              className="input w-full text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5 block flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location <span className="font-normal normal-case text-stone-400">(optional)</span>
            </label>
            <input type="text" value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Worldwide"
              className="input w-full text-sm" />
          </div>
        </div>

        {/* Boards */}
        <div className="mb-4">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2 block">Boards</label>
          <div className="flex flex-wrap gap-2">
            {SITE_OPTIONS.map(s => (
              <button key={s.key} onClick={() => toggleSite(s.key)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                  sites.includes(s.key)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          {/* Results wanted */}
          <div>
            <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">
              <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" /> Results / board</span>
              <span className="text-brand-700 dark:text-brand-400">{resultsWanted}</span>
            </label>
            <input type="range" min={10} max={100} step={10}
              value={resultsWanted}
              onChange={e => setResultsWanted(Number(e.target.value))}
              className="w-full accent-brand-600" />
          </div>
          {/* Hours old */}
          <div>
            <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Posted within</span>
              <span className="text-brand-700 dark:text-brand-400">{hoursOld > 0 ? `${hoursOld}h` : 'any'}</span>
            </label>
            <input type="range" min={0} max={168} step={12}
              value={hoursOld}
              onChange={e => setHoursOld(Number(e.target.value))}
              className="w-full accent-brand-600" />
          </div>
          {/* Remote only */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-stone-50 dark:bg-[#162033]">
            <span className="flex items-center gap-2 text-sm font-semibold text-stone-700 dark:text-stone-200">
              <Globe className="w-4 h-4 text-brand-600" /> Remote only
            </span>
            <button onClick={() => setRemoteOnly(v => !v)}
              className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0',
                remoteOnly ? 'bg-brand-600' : 'bg-stone-200 dark:bg-stone-700')}>
              <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                remoteOnly ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 p-3 mt-4 bg-stone-50 dark:bg-[#162033] rounded-lg text-xs text-stone-500 dark:text-stone-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" />
          <p>
            Search runs live against the JobSpy service and lists everything it returns — nothing is saved until you
            click <span className="font-semibold">Import to platform</span>. Imported jobs are deduped on their apply URL, so re-importing is safe.
            The daily cron also ingests JobSpy across a rotating set of queries automatically.
          </p>
        </div>
      </div>

      {/* Results */}
      {configLoading ? (
        <div className="card p-12 text-center text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-16 text-center">
          <Radar className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
          <p className="font-bold text-stone-500 dark:text-stone-400 mb-1">No results yet</p>
          <p className="text-sm text-stone-400 dark:text-stone-500">
            {notConfigured ? 'Connect JobSpy to start searching.' : 'Run a search to list every job JobSpy finds.'}
          </p>
        </div>
      ) : (
        <div>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <List className="w-4 h-4 text-brand-600" />
              {filteredJobs.length} jobs
              {jobs.length !== filteredJobs.length && <span className="font-normal text-stone-400"> (of {jobs.length})</span>}
            </span>
            {sitesInResults.length > 1 && (
              <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
                className="text-xs border border-stone-200 dark:border-[#1e3a5f] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#0a1628] text-stone-600 dark:text-stone-300 focus:outline-none">
                <option value="">All boards</option>
                {sitesInResults.map(s => (
                  <option key={s} value={s}>{s} ({jobs.filter(j => j.site === s).length})</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            {filteredJobs.map(job => {
              const salary = fmtSalary(job);
              return (
                <div key={job._id}
                  className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border bg-white dark:bg-[#0a1628] transition-all',
                    job.saved ? 'border-green-200 dark:border-green-900' : 'border-stone-200 dark:border-[#1e3a5f]')}>
                  <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-sm font-black text-brand-700 dark:text-brand-400 shrink-0">
                    {job.company[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
                    <p className="text-xs text-stone-400 truncate">{job.company} · {job.location}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.category}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.level}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">{job.site}</span>
                    {salary && <span className="text-xs font-bold text-brand-700 dark:text-brand-400">{salary}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSafeOpenUrl(job.applyUrl) && (
                      <a href={job.applyUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-stone-400 hover:text-brand-700 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors"
                        title="Open job">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {job.saved
                      ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" aria-label="Imported" />
                      : <button onClick={() => setJobs(prev => prev.filter(j => j._id !== job._id))}
                          className="p-1.5 rounded-lg text-stone-300 hover:text-red-400 transition-colors" title="Discard">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
