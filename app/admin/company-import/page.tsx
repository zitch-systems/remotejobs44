'use client';
// app/admin/company-import/page.tsx
// Paste 1–500+ career page URLs at once → auto-detects ATS → pulls all jobs
import { useState, useRef, useCallback } from 'react';
import {
  Upload, Zap, CheckCircle, XCircle, AlertCircle, RefreshCw,
  Download, Trash2, Play, Pause, ChevronDown, ChevronRight, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { detectATSFromUrl, type ATSPlatform } from '@/lib/ats-engine';

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
  jobs?: any[];
}

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  greenhouse: { label: 'Greenhouse', color: 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20' },
  lever:      { label: 'Lever',      color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  ashby:      { label: 'Ashby',      color: 'text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
  workable:   { label: 'Workable',   color: 'text-cyan-700 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/20' },
  recruitee:  { label: 'Recruitee',  color: 'text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20' },
  unknown:    { label: 'Unknown',    color: 'text-stone-500 bg-stone-100 dark:bg-stone-800' },
};

// Pre-populated with the company list from the document
const PRESET_COMPANIES = `https://boards.greenhouse.io/anthropic
https://boards.greenhouse.io/stripe
https://boards.greenhouse.io/figma
https://boards.greenhouse.io/notion
https://boards.greenhouse.io/vercel
https://boards.greenhouse.io/linear
https://boards.greenhouse.io/retool
https://boards.greenhouse.io/airbnb
https://jobs.lever.co/netflix
https://jobs.lever.co/shopify
https://jobs.lever.co/zapier
https://jobs.lever.co/buffer
https://jobs.ashbyhq.com/adaptive-ml
https://jobs.ashbyhq.com/cohere
https://jobs.ashbyhq.com/mistral
https://apply.workable.com/algolia
https://apply.workable.com/deliveroo
https://apply.workable.com/typeform
https://datadog.recruitee.com
https://confluent.recruitee.com`.trim();

export default function CompanyImportPage() {
  const [rawInput, setRawInput] = useState(PRESET_COMPANIES);
  const [entries, setEntries] = useState<CompanyEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [totalImported, setTotalImported] = useState(0);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');
  const pauseRef = useRef(false);
  const abortRef = useRef(false);

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
        status: d ? 'ready' : 'pending',
        jobCount: 0,
        expanded: false,
        jobs: [],
      };
    });
    setEntries(detected);
  }

  // Step 2: Fetch jobs from all detected entries
  async function fetchAll() {
    if (running) { pauseRef.current = !pauseRef.current; setPaused(p => !p); return; }
    setRunning(true);
    setPaused(false);
    abortRef.current = false;
    pauseRef.current = false;

    const toFetch = entries.filter(e => e.status === 'ready' || e.status === 'error');

    for (let i = 0; i < toFetch.length; i++) {
      if (abortRef.current) break;
      while (pauseRef.current) await sleep(300);

      const entry = toFetch[i];
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'fetching' } : e));

      try {
        const params = entry.platform !== 'unknown'
          ? `/api/ats?platform=${entry.platform}&slug=${entry.slug}`
          : `/api/ats?url=${encodeURIComponent(entry.url)}`;
        const res = await fetch(params);
        const data = await res.json();

        setEntries(prev => prev.map(e => e.id === entry.id ? {
          ...e,
          status: data.error ? 'error' : 'done',
          jobCount: data.total ?? 0,
          jobs: (data.jobs ?? []).slice(0, 10),
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
      <div className="mb-6">
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-1">
          Bulk Company Import
        </h1>
        <p className="text-sm text-stone-400 dark:text-stone-500">
          Paste up to 500 career page URLs — auto-detects Greenhouse, Lever, Ashby, Workable, and Recruitee boards and pulls all jobs.
        </p>
      </div>

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
              { label: 'Detected', value: stats.detected, color: 'text-green-600 dark:text-green-400' },
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
          <div className="flex gap-3 mb-4 flex-wrap">
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
                      {entry.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500" />}
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
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
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
                      {entry.jobs && entry.jobs.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {entry.jobs.map((job: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 py-1 border-b border-stone-100 dark:border-[#1e3a5f] last:border-0">
                              <span className="flex-1 font-medium text-stone-700 dark:text-stone-300 truncate">{job.title}</span>
                              <span className="text-stone-400 shrink-0">{job.location}</span>
                            </div>
                          ))}
                          {entry.jobCount > entry.jobs.length && (
                            <p className="text-stone-400 dark:text-stone-500 text-center pt-1">
                              + {entry.jobCount - entry.jobs.length} more jobs
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
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
