'use client';
// app/admin/company-import/page.tsx
// Paste 1–500+ career page URLs at once → auto-detects ATS → pulls all jobs
import { useState, useRef, useEffect } from 'react';
import {
  Zap, CheckCircle, XCircle, RefreshCw,
  Download, Trash2, Play, Pause, ChevronDown, ChevronRight, Search,
  Database, History, Clock, Layers,
  CloudUpload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// Import from the client-safe detection module — lib/ats-engine pulls in
// puppeteer-core / @sparticuz/chromium for its server-side render fallback,
// which would bloat the admin bundle and break webpack on the browser.
import { detectATSFromUrl, type ATSPlatform } from '@/lib/ats-detect';

type DetectStatus = 'pending' | 'detecting' | 'ready' | 'fetching' | 'done' | 'error' | 'skipped';

interface CompanyEntry {
  id: string;
  url: string;
  name?: string;
  platform: ATSPlatform | 'unknown';
  slug: string;
  apiEndpoint: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  status: DetectStatus;
  jobCount: number;
  error?: string;
  expanded: boolean;
  jobs?: any[];       // all jobs (full list, not sliced)
  jobsPreview?: any[]; // first 10 for display
}

interface ScrapeHistoryEntry {
  id: string;
  date: string;
  totalCompanies: number;
  totalJobs: number;
  inserted: number;
  skipped: number;
  platforms: Record<string, number>;
}

const HISTORY_KEY = 'rj44-scrape-history';

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  greenhouse: { label: 'Greenhouse', color: 'text-brand-700 bg-brand-50 dark:text-brand-400 dark:bg-brand-900/20' },
  lever:      { label: 'Lever',      color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  ashby:      { label: 'Ashby',      color: 'text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
  workable:   { label: 'Workable',   color: 'text-cyan-700 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/20' },
  recruitee:  { label: 'Recruitee',  color: 'text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20' },
  unknown:    { label: 'Unknown',    color: 'text-stone-500 bg-stone-100 dark:bg-stone-800' },
};

// Curated preset of ATS URLs that actually return jobs as of writing.
// Greenhouse + Ashby are the most reliable. Lever/Workable are spotty —
// many of their customers have migrated to other ATSs but the slug remains.
// If you want to add more, paste your own URLs and click Detect ATS.
const PRESET_COMPANIES = `https://boards.greenhouse.io/anthropic
https://boards.greenhouse.io/stripe
https://boards.greenhouse.io/figma
https://boards.greenhouse.io/notion
https://boards.greenhouse.io/vercel
https://boards.greenhouse.io/linear
https://boards.greenhouse.io/retool
https://boards.greenhouse.io/airbnb
https://boards.greenhouse.io/discord
https://boards.greenhouse.io/scale
https://boards.greenhouse.io/openai
https://boards.greenhouse.io/databricks
https://boards.greenhouse.io/instacart
https://boards.greenhouse.io/duolingo
https://boards.greenhouse.io/coinbase
https://boards.greenhouse.io/dropbox
https://boards.greenhouse.io/asana
https://boards.greenhouse.io/clickup
https://boards.greenhouse.io/affirm
https://boards.greenhouse.io/whatnot
https://jobs.ashbyhq.com/cohere
https://jobs.ashbyhq.com/mistral
https://jobs.ashbyhq.com/posthog
https://jobs.ashbyhq.com/replicate
https://jobs.ashbyhq.com/perplexity
https://jobs.ashbyhq.com/clay
https://jobs.ashbyhq.com/granola
https://jobs.lever.co/palantir
https://jobs.lever.co/leadgenius
https://jobs.lever.co/octopusdeploy`.trim();

export default function CompanyImportPage() {
  const [rawInput, setRawInput] = useState(PRESET_COMPANIES);
  const [entries, setEntries] = useState<CompanyEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [totalImported, setTotalImported] = useState(0);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([]);
  const pauseRef = useRef(false);
  const abortRef = useRef(false);

  // Load scrape history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  // Parse URLs from input (handles newlines, commas, spaces, tabs)
  function parseUrls(raw: string): string[] {
    return raw
      .split(/[\n,\t]+/)
      .map(u => u.trim())
      .filter(u => u.startsWith('http') && u.length > 10)
      .slice(0, 500);
  }

  // Step 1: Detect all platforms instantly (no HTTP)
  function detectAll() {
    const urls = parseUrls(rawInput);
    if (!urls.length) return;

    const detected: CompanyEntry[] = urls.map(url => {
      const d = detectATSFromUrl(url);
      const name = url.split('/').slice(-1)[0] || url.split('/').slice(-2)[0];
      return {
        id: Math.random().toString(36).slice(2),
        url,
        name: name || url,
        platform: d?.platform ?? 'unknown',
        slug: d?.slug ?? '',
        apiEndpoint: d?.apiEndpoint ?? null,
        confidence: d?.confidence ?? null,
        // Mark every parsed URL as 'ready' so it shows up in the Fetch All
        // queue — even URLs we couldn't ATS-detect from the URL alone get
        // a second chance via HTML scrape on the backend.
        status: 'ready',
        jobCount: 0,
        expanded: false,
        jobs: [],
      };
    });
    setEntries(detected);
  }

  // Step 2: Fetch jobs from all detected entries.
  // We also process status='pending' entries (URLs whose ATS couldn't be
  // detected from the URL alone, e.g. fireworks.ai/careers). The backend
  // /api/ats?url= path fetches the HTML and finds embedded ATS links
  // (boards.greenhouse.io/fireworksai etc.), so unknown URLs often still
  // resolve to jobs.
  async function fetchAll() {
    if (running) { pauseRef.current = !pauseRef.current; setPaused(p => !p); return; }
    setRunning(true);
    setPaused(false);
    abortRef.current = false;
    pauseRef.current = false;

    const toFetch = entries.filter(e => e.status === 'ready' || e.status === 'error' || e.status === 'pending');

    for (let i = 0; i < toFetch.length; i++) {
      if (abortRef.current) break;
      while (pauseRef.current) await sleep(300);

      const entry = toFetch[i];
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'fetching' } : e));

      try {
        // Use the slug+platform shortcut when we already know it; otherwise
        // hand the full URL to the backend so it can HTML-scrape for ATS links.
        const params = entry.platform !== 'unknown' && entry.slug
          ? `/api/ats?platform=${entry.platform}&slug=${entry.slug}`
          : `/api/ats?url=${encodeURIComponent(entry.url)}`;
        const res = await fetch(params);
        const data = await res.json();

        const allJobs = data.jobs ?? [];
        setEntries(prev => prev.map(e => e.id === entry.id ? {
          ...e,
          status: data.error ? 'error' : 'done',
          jobCount: data.total ?? allJobs.length,
          jobs: allJobs,              // keep ALL jobs for saving
          jobsPreview: allJobs.slice(0, 10), // only 10 for display
          error: data.error,
          platform: data.platform ?? e.platform,
          slug: data.slug ?? e.slug,
        } : e));

        if (!data.error && data.total > 0) {
          setTotalImported(t => t + (data.total ?? 0));
        }
      } catch (err: any) {
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', error: err.message } : e));
      }

      // Rate limiting — 3 concurrent max with delay
      if (i % 3 === 2) await sleep(200);
    }
    setRunning(false);
  }

  function stopAll() {
    abortRef.current = true;
    pauseRef.current = false;
    setPaused(false);
    setRunning(false);
  }

  function clearAll() {
    setEntries([]);
    setTotalImported(0);
    setRunning(false);
    setSaveResult(null);
  }

  async function saveAllToSupabase() {
    const doneEntries = entries.filter(e => e.status === 'done' && (e.jobs?.length ?? 0) > 0);
    if (doneEntries.length === 0) return;

    setSaving(true);
    setSaveResult(null);

    // Collect ALL jobs from all done entries (full list, not sliced preview)
    const allJobs = doneEntries.flatMap(e => e.jobs ?? []);

    try {
      // Save in batches of 500 to avoid payload limit
      let totalInserted = 0;
      let totalSkipped = 0;
      for (let i = 0; i < allJobs.length; i += 500) {
        const batch = allJobs.slice(i, i + 500);
        const res = await fetch('/api/ats/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobs: batch }),
        });
        const data = await res.json();
        if (res.ok) {
          totalInserted += data.inserted ?? 0;
          totalSkipped  += data.skipped  ?? 0;
        } else {
          alert(data.error ?? 'Failed to save jobs');
          setSaving(false);
          return;
        }
      }
      const result = { inserted: totalInserted, skipped: totalSkipped };
      setSaveResult(result);

      // Persist to scrape history
      const historyEntry: ScrapeHistoryEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        totalCompanies: doneEntries.length,
        totalJobs: allJobs.length,
        inserted: totalInserted,
        skipped: totalSkipped,
        platforms: stats.byPlatform,
      };
      setHistory(prev => {
        const updated = [historyEntry, ...prev].slice(0, 50); // keep last 50
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    } catch (err: any) {
      alert(err.message ?? 'Failed to save jobs');
    } finally {
      setSaving(false);
    }
  }

  function toggleExpand(id: string) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, expanded: !e.expanded } : e));
  }

  function exportCSV() {
    const rows = [
      ['Company', 'Platform', 'Slug', 'Jobs', 'Status', 'URL'],
      ...entries.map(e => [e.name ?? '', e.platform, e.slug, e.jobCount, e.status, e.url]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'companies-import.csv';
    a.click();
  }

  const filtered = entries.filter(e => {
    const mp = filterPlatform === 'all' || e.platform === filterPlatform;
    const ms = filterStatus === 'all' || e.status === filterStatus;
    const mq = !searchQ || e.url.includes(searchQ) || (e.name ?? '').toLowerCase().includes(searchQ.toLowerCase());
    return mp && ms && mq;
  });

  const stats = {
    total: entries.length,
    detected: entries.filter(e => e.platform !== 'unknown').length,
    done: entries.filter(e => e.status === 'done').length,
    errors: entries.filter(e => e.status === 'error').length,
    jobs: entries.reduce((s, e) => s + e.jobCount, 0),
    byPlatform: {
      greenhouse: entries.filter(e => e.platform === 'greenhouse').length,
      lever: entries.filter(e => e.platform === 'lever').length,
      ashby: entries.filter(e => e.platform === 'ashby').length,
      workable: entries.filter(e => e.platform === 'workable').length,
      recruitee: entries.filter(e => e.platform === 'recruitee').length,
      unknown: entries.filter(e => e.platform === 'unknown').length,
    }
  };

  const progress = entries.length > 0
    ? Math.round((entries.filter(e => ['done','error','skipped'].includes(e.status)).length / entries.length) * 100)
    : 0;

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-1 flex items-center gap-2">
            <CloudUpload className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            Bulk Company Import
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">
            Paste up to 500 career page URLs — auto-detects Greenhouse, Lever, Ashby, Workable, and Recruitee and pulls all jobs.
          </p>
        </div>
        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#0d1a2e] rounded-xl border border-stone-200 dark:border-[#1e3a5f]">
          <button onClick={() => setActiveTab('import')}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
              activeTab === 'import' ? 'bg-white dark:bg-[#162033] text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300')}>
            <Layers className="w-3.5 h-3.5" /> Import
          </button>
          <button onClick={() => setActiveTab('history')}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
              activeTab === 'history' ? 'bg-white dark:bg-[#162033] text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300')}>
            <History className="w-3.5 h-3.5" /> History
            {history.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-brand-600 text-white text-[10px] font-bold">{history.length}</span>}
          </button>
        </div>
      </div>

      {/* History Tab */}
      {activeTab === 'history' && (
        <div>
          {history.length === 0 ? (
            <div className="card p-12 text-center">
              <History className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
              <h3 className="font-bold text-stone-500 dark:text-stone-400 mb-1">No scrape history yet</h3>
              <p className="text-sm text-stone-400 dark:text-stone-500">Run a scrape and save jobs to DB to see history here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id} className="card p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-stone-400" />
                        <span className="text-sm font-bold text-stone-700 dark:text-stone-300">
                          {new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(h.platforms).map(([p, count]) => count > 0 && (
                          <span key={p} className={cn('px-2 py-0.5 rounded-full text-xs font-bold', PLATFORM_META[p]?.color ?? '')}>
                            {PLATFORM_META[p]?.label ?? p}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="font-bold text-lg text-stone-900 dark:text-stone-100">{h.totalCompanies}</div>
                        <div className="text-xs text-stone-400">Companies</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-lg text-brand-600 dark:text-brand-400">{h.inserted.toLocaleString()}</div>
                        <div className="text-xs text-stone-400">Saved</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-lg text-stone-400">{h.skipped.toLocaleString()}</div>
                        <div className="text-xs text-stone-400">Skipped</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-lg text-amber-600 dark:text-amber-400">{h.totalJobs.toLocaleString()}</div>
                        <div className="text-xs text-stone-400">Total jobs</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => {
                setHistory([]);
                try { localStorage.removeItem(HISTORY_KEY); } catch {}
              }} className="text-xs text-red-400 hover:text-red-600 transition-colors mt-2">
                Clear history
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'import' && (<>

      {/* Input area */}
      {entries.length === 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Paste career page URLs</h2>
            <span className="text-xs text-stone-400 dark:text-stone-500">
              {parseUrls(rawInput).length} URLs parsed
            </span>
          </div>
          <textarea
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            rows={12}
            placeholder={`Paste any mix of career page URLs, one per line:\n\nhttps://boards.greenhouse.io/stripe\nhttps://jobs.lever.co/netflix\nhttps://jobs.ashbyhq.com/cohere\nhttps://apply.workable.com/algolia\nhttps://www.anthropic.com/careers\nhttps://linear.app/careers\n...(up to 500 at a time)`}
            className="input text-xs font-mono leading-relaxed resize-y min-h-[200px] mb-4"
          />
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={detectAll}
              disabled={parseUrls(rawInput).length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Detect ATS ({parseUrls(rawInput).length} URLs)
            </button>
            <button onClick={() => setRawInput('')}
              className="px-4 py-2.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-500 text-sm font-medium rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
              Clear
            </button>
          </div>

          {/* ATS reference */}
          <div className="mt-5 pt-4 border-t border-stone-100 dark:border-[#1e3a5f]">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-3">Supported ATS URL patterns</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { platform: 'greenhouse', pattern: 'boards.greenhouse.io/{company}', example: 'boards.greenhouse.io/stripe', count: '10,000+ companies' },
                { platform: 'lever', pattern: 'jobs.lever.co/{company}', example: 'jobs.lever.co/netflix', count: '5,000+ companies' },
                { platform: 'ashby', pattern: 'jobs.ashbyhq.com/{company}', example: 'jobs.ashbyhq.com/cohere', count: '3,000+ companies' },
                { platform: 'workable', pattern: 'apply.workable.com/{company}', example: 'apply.workable.com/algolia', count: '27,000+ companies' },
                { platform: 'recruitee', pattern: '{company}.recruitee.com', example: 'datadog.recruitee.com', count: '5,000+ companies' },
              ].map(p => {
                const pm = PLATFORM_META[p.platform];
                return (
                  <div key={p.platform} className="p-3 rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#162033]">
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-bold mb-1.5', pm.color)}>{pm.label}</span>
                    <p className="text-xs font-mono text-stone-500 dark:text-stone-400 mb-0.5">{p.pattern}</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500">{p.count}</p>
                  </div>
                );
              })}
              <div className="p-3 rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#162033]">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold mb-1.5 bg-stone-100 dark:bg-stone-800 text-stone-500">Any URL</span>
                <p className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">e.g. anthropic.com/careers</p>
                <p className="text-xs text-stone-400 dark:text-stone-500">Page scraped for ATS links</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results view */}
      {entries.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Total', value: stats.total, color: 'text-stone-700 dark:text-stone-300' },
              { label: 'Detected', value: stats.detected, color: 'text-brand-600 dark:text-brand-400' },
              { label: 'Done', value: stats.done, color: 'text-brand-700 dark:text-brand-400' },
              { label: 'Errors', value: stats.errors, color: 'text-red-500' },
              { label: 'Jobs found', value: stats.jobs.toLocaleString(), color: 'text-amber-600 dark:text-amber-400' },
            ].map(s => (
              <div key={s.label} className="card p-3 text-center">
                <div className={cn('text-xl font-display font-extrabold', s.color)}>{s.value}</div>
                <div className="text-xs text-stone-400 dark:text-stone-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Platform breakdown */}
          <div className="card p-3 mb-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-stone-400 dark:text-stone-500 mr-1">Platforms:</span>
              {Object.entries(stats.byPlatform).map(([platform, count]) => count > 0 && (
                <span key={platform} className={cn('px-2 py-0.5 rounded-full text-xs font-bold', PLATFORM_META[platform]?.color ?? '')}>
                  {PLATFORM_META[platform]?.label ?? platform}: {count}
                </span>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          {running && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-stone-400 dark:text-stone-500 mb-1">
                <span>Processing… {progress}%</span>
                <span>{stats.done + stats.errors} / {stats.total}</span>
              </div>
              <div className="h-2 bg-stone-100 dark:bg-[#162033] rounded-full overflow-hidden">
                <div className="h-full bg-brand-600 dark:bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <button onClick={fetchAll}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-colors',
                running && !paused ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600'
              )}>
              {running && !paused ? <><Pause className="w-4 h-4" /> Pause</> : running && paused ? <><Play className="w-4 h-4" /> Resume</> : <><Play className="w-4 h-4" /> Fetch All Jobs</>}
            </button>
            {running && (
              <button onClick={stopAll}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold border border-red-300 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                <XCircle className="w-4 h-4" /> Stop
              </button>
            )}

            {/* Save to Supabase — only shown when there are done entries with jobs */}
            {stats.jobs > 0 && !running && (
              <button
                onClick={saveAllToSupabase}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><Database className="w-4 h-4" /> Save {stats.jobs.toLocaleString()} Jobs to DB</>
                )}
              </button>
            )}

            {saveResult && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg text-sm">
                <CheckCircle className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <span className="font-semibold text-brand-700 dark:text-brand-400">
                  {saveResult.inserted} saved
                </span>
                {saveResult.skipped > 0 && (
                  <span className="text-stone-400 dark:text-stone-500">· {saveResult.skipped} skipped (duplicates)</span>
                )}
              </div>
            )}

            <button onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-500 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-500 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors ml-auto">
              <Trash2 className="w-4 h-4" /> Reset
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-lg">
              <Search className="w-3.5 h-3.5 text-stone-400" />
              <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Search…" className="border-none outline-none bg-transparent text-xs text-stone-900 dark:text-stone-100 w-28" />
            </div>
            <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
              className="input text-xs py-2 w-auto">
              <option value="all">All platforms</option>
              {Object.entries(PLATFORM_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="input text-xs py-2 w-auto">
              <option value="all">All status</option>
              <option value="ready">Ready</option>
              <option value="done">Done</option>
              <option value="error">Error</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">{filtered.length} of {entries.length} entries</p>

          {/* Entry list */}
          <div className="space-y-2">
            {filtered.map(entry => {
              const pm = PLATFORM_META[entry.platform] ?? PLATFORM_META.unknown;
              return (
                <div key={entry.id} className="card overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors"
                    onClick={() => toggleExpand(entry.id)}>
                    {/* Status icon */}
                    <div className="shrink-0">
                      {entry.status === 'done' && <CheckCircle className="w-4 h-4 text-brand-500" />}
                      {entry.status === 'error' && <XCircle className="w-4 h-4 text-red-400" />}
                      {entry.status === 'fetching' && <RefreshCw className="w-4 h-4 text-brand-600 animate-spin" />}
                      {entry.status === 'ready' && <div className="w-4 h-4 rounded-full border-2 border-blue-400" />}
                      {entry.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-stone-300 dark:border-stone-600" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate max-w-xs">{entry.url}</span>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', pm.color)}>{pm.label}</span>
                        {entry.slug && <span className="text-xs text-stone-400 font-mono">{entry.slug}</span>}
                        {entry.status === 'done' && entry.jobCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400">
                            {entry.jobCount} jobs
                          </span>
                        )}
                        {entry.status === 'error' && (
                          <span className="text-xs text-red-400 truncate">{entry.error}</span>
                        )}
                      </div>
                    </div>

                    {entry.expanded ? <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />}
                  </div>

                  {entry.expanded && (
                    <div className="border-t border-stone-100 dark:border-[#1e3a5f] px-4 py-3 bg-stone-50 dark:bg-[#162033] text-xs animate-fade-in">
                      {entry.apiEndpoint && (
                        <div className="mb-2">
                          <span className="text-stone-400 dark:text-stone-500">API: </span>
                          <span className="font-mono text-brand-700 dark:text-brand-400 break-all">{entry.apiEndpoint}</span>
                        </div>
                      )}
                      {(entry.jobsPreview ?? entry.jobs ?? []).length > 0 && (
                        <div className="space-y-1 mt-2">
                          {(entry.jobsPreview ?? entry.jobs ?? []).map((job: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 py-1 border-b border-stone-100 dark:border-[#1e3a5f] last:border-0">
                              <span className="flex-1 font-medium text-stone-700 dark:text-stone-300 truncate">{job.title}</span>
                              <span className="text-stone-400 shrink-0">{job.location}</span>
                            </div>
                          ))}
                          {entry.jobCount > 10 && (
                            <p className="text-stone-400 dark:text-stone-500 text-center pt-1">
                              + {entry.jobCount - 10} more jobs (all will be saved)
                            </p>
                          )}
                        </div>
                      )}
                      {entry.status === 'done' && entry.jobCount === 0 && (
                        <p className="text-stone-400 dark:text-stone-500">No jobs currently listed</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      </>)}
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
