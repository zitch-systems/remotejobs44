'use client';
// app/admin/sources/page.tsx — Source management (Consider removed, Paystack-ready)
import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, AlertCircle, ExternalLink, Rss, Code2, Globe, Eye, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type SourceMethod = 'rss' | 'json-api' | 'scrape' | 'greenhouse-api' | 'lever-api' | 'ashby-api' | 'workable-api' | 'detecting' | 'unknown';
type SourceStatus = 'idle' | 'detecting' | 'ok' | 'js-only' | 'error';

interface PreviewJob { title: string; company: string; location: string; applyUrl?: string; }

interface Source {
  id: string; url: string; name: string; method: SourceMethod; status: SourceStatus;
  jobCount: number; lastSync?: string; error?: string; requiresJS?: boolean;
  detectedPlatform?: string; suggestion?: string; jobs?: PreviewJob[]; expanded?: boolean;
}

const METHOD_META: Record<SourceMethod, { label: string; color: string }> = {
  'rss':           { label: 'RSS Feed',      color: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
  'json-api':      { label: 'JSON API',      color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  'scrape':        { label: 'HTML Scrape',   color: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/20' },
  'greenhouse-api':{ label: 'Greenhouse',    color: 'text-brand-700 bg-brand-50 dark:text-brand-400 dark:bg-brand-900/20' },
  'lever-api':     { label: 'Lever ATS',     color: 'text-brand-700 bg-brand-50 dark:text-brand-400 dark:bg-brand-900/20' },
  'ashby-api':     { label: 'Ashby ATS',     color: 'text-brand-700 bg-brand-50 dark:text-brand-400 dark:bg-brand-900/20' },
  'workable-api':  { label: 'Workable',      color: 'text-cyan-700 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/20' },
  'detecting':     { label: 'Detecting…',    color: 'text-stone-500 bg-stone-100 dark:bg-stone-800' },
  'unknown':       { label: 'Unknown',        color: 'text-stone-500 bg-stone-100 dark:bg-stone-800' },
};

const PRESETS = [
  { name: 'We Work Remotely', url: 'https://weworkremotely.com/remote-jobs.rss' },
  { name: 'Remotive', url: 'https://remotive.com/api/remote-jobs' },
  { name: 'Jobicy', url: 'https://jobicy.com/api/v2/remote-jobs?count=50' },
  { name: 'Remote OK', url: 'https://remoteok.com/remote-jobs.rss' },
  { name: 'Working Nomads', url: 'https://www.workingnomads.com/jobs?format=rss' },
  { name: 'YC Hiring', url: 'https://yc-oss.github.io/api/companies/hiring.json' },
];

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [bulkText, setBulkText] = useState('');
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{done:number;total:number} | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('rj44_sources_v2');
    if (saved) setSources(JSON.parse(saved));
  }, []);

  function persist(updated: Source[]) {
    setSources(updated);
    localStorage.setItem('rj44_sources_v2', JSON.stringify(updated.map(s => ({ ...s, jobs: undefined }))));
  }

  async function detectAndFetch(url: string): Promise<Partial<Source>> {
    const rssRes = await fetch(`/api/rss?url=${encodeURIComponent(url)}`);
    const rssData = await rssRes.json();
    if (rssData.jobs?.length > 0) {
      return { method: rssData.method === 'json-api' ? 'json-api' : 'rss', status: 'ok', jobCount: rssData.total ?? rssData.jobs.length, jobs: rssData.jobs.slice(0, 20) };
    }
    const scrapeRes = await fetch(`/api/scrape?url=${encodeURIComponent(url)}&mode=auto`);
    const scrapeData = await scrapeRes.json();
    const method = (scrapeData.method ?? 'scrape') as SourceMethod;
    if (scrapeData.requiresJS) {
      return { method, status: 'js-only', jobCount: 0, requiresJS: true, detectedPlatform: scrapeData.detectedPlatform, suggestion: scrapeData.suggestion };
    }
    return { method, status: scrapeData.jobs?.length > 0 ? 'ok' : 'error', jobCount: scrapeData.total ?? scrapeData.jobs?.length ?? 0, jobs: (scrapeData.jobs ?? []).slice(0, 20), error: scrapeData.error };
  }

  async function handleAdd() {
    const url = urlInput.trim();
    if (!url) return;
    setAdding(true);
    const id = Date.now().toString();
    const placeholder: Source = { id, url, name: nameInput.trim() || extractName(url), method: 'detecting', status: 'detecting', jobCount: 0 };
    const next = [...sources, placeholder];
    setSources(next);
    setUrlInput(''); setNameInput('');
    const result = await detectAndFetch(url);
    persist(next.map(s => s.id === id ? { ...s, ...result, lastSync: new Date().toISOString() } : s));
    setAdding(false);
  }

  async function handleBulkAdd() {
    const urls = bulkText
      .split(/[\n,\s]+/)
      .map(u => u.trim())
      .filter(u => u.startsWith('http'));
    if (!urls.length) return;

    setBulkAdding(true);
    setBulkProgress({ done: 0, total: urls.length });

    // Add placeholders for all URLs immediately
    const placeholders: Source[] = urls.map((url, i) => ({
      id: `bulk-${Date.now()}-${i}`,
      url,
      name: extractName(url),
      method: 'detecting' as SourceMethod,
      status: 'detecting' as SourceStatus,
      jobCount: 0,
    }));

    setSources(prev => {
      const existing = new Set(prev.map(s => s.url));
      const fresh = placeholders.filter(p => !existing.has(p.url));
      return [...prev, ...fresh];
    });
    setBulkText('');

    // Process up to 4 at a time
    const CONCURRENCY = 4;
    let done = 0;
    for (let i = 0; i < placeholders.length; i += CONCURRENCY) {
      const batch = placeholders.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (placeholder) => {
        const result = await detectAndFetch(placeholder.url);
        setSources(prev => {
          const updated = prev.map(s =>
            s.id === placeholder.id ? { ...s, ...result, lastSync: new Date().toISOString() } : s
          );
          localStorage.setItem('rj44_sources_v2', JSON.stringify(updated.map(s => ({ ...s, jobs: undefined }))));
          return updated;
        });
        done++;
        setBulkProgress({ done, total: placeholders.length });
      }));
    }

    setBulkAdding(false);
    setBulkProgress(null);
  }

  async function handleRefresh(source: Source) {
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, status: 'detecting' } : s));
    const result = await detectAndFetch(source.url);
    persist(sources.map(s => s.id === source.id ? { ...s, ...result, lastSync: new Date().toISOString() } : s));
  }

  function handleImport(source: Source) {
    if (!source.jobs?.length) return;
    setImportedCount(c => c + source.jobs!.length);
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999';
    el.textContent = `✅ ${source.jobs.length} jobs from ${source.name} imported`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 3000);
  }

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <div className="mb-7">
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-1">Job Sources</h1>
        <p className="text-sm text-stone-400 dark:text-stone-500">Auto-detects RSS, JSON API, Greenhouse, Lever, Ashby, or Workable from any URL.</p>
        {importedCount > 0 && <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 rounded-lg text-sm font-bold"><CheckCircle className="w-4 h-4" /> {importedCount} jobs imported</div>}
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3">Add Single Source</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input ref={urlRef} type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="Paste URL — RSS, JSON API, or jobs page…" className="input flex-1 text-sm" />
          <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Label (optional)" className="input sm:w-44 text-sm" />
          <button onClick={handleAdd} disabled={!urlInput.trim() || adding} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors shrink-0">
            {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {adding ? 'Detecting…' : 'Add Source'}
          </button>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.url} onClick={() => { setUrlInput(p.url); setNameInput(p.name); urlRef.current?.focus(); }} className="px-3 py-1.5 text-xs font-medium border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-500 dark:text-stone-400 hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk URL paste */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Bulk Add URLs</h2>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Paste hundreds of job board / career page URLs — one per line. Auto-detects RSS, JSON API, Greenhouse, Lever, Ashby, etc.</p>
          </div>
          {bulkProgress && (
            <span className="text-xs font-bold text-brand-700 dark:text-brand-400 shrink-0">
              {bulkProgress.done} / {bulkProgress.total} done
            </span>
          )}
        </div>
        <textarea
          value={bulkText}
          onChange={e => setBulkText(e.target.value)}
          placeholder={'https://jobs.ashby.com/company-x\nhttps://company.greenhouse.io/boards/\nhttps://weworkremotely.com/remote-jobs.rss\n...'}
          rows={6}
          className="input text-sm font-mono resize-y mb-3"
          disabled={bulkAdding}
        />
        {bulkProgress && (
          <div className="w-full bg-stone-100 dark:bg-[#162033] rounded-full h-1.5 mb-3 overflow-hidden">
            <div
              className="h-full bg-brand-600 rounded-full transition-all duration-300"
              style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
            />
          </div>
        )}
        <button
          onClick={handleBulkAdd}
          disabled={!bulkText.trim() || bulkAdding}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {bulkAdding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          {bulkAdding ? `Detecting… ${bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : ''}` : 'Add All & Auto-Detect'}
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="card p-12 text-center">
          <Rss className="w-10 h-10 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
          <p className="font-bold text-stone-500 dark:text-stone-400 mb-1">No sources yet</p>
          <p className="text-sm text-stone-400 dark:text-stone-500">Paste a job board URL above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map(source => {
            const mm = METHOD_META[source.method] ?? METHOD_META.unknown;
            return (
              <div key={source.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', { 'bg-brand-500': source.status === 'ok', 'bg-amber-400': source.status === 'js-only', 'bg-red-500': source.status === 'error', 'bg-brand-400 animate-pulse': source.status === 'detecting', 'bg-stone-300': source.status === 'idle' })} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-bold text-sm text-stone-900 dark:text-stone-100">{source.name}</span>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold', mm.color)}>{mm.label}</span>
                      {source.status === 'ok' && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400">{source.jobCount} jobs</span>}
                      {source.status === 'js-only' && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">⚡ JS site</span>}
                    </div>
                    <p className="text-xs text-stone-400 dark:text-stone-500 truncate">{source.url}</p>
                    {source.status === 'js-only' && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">⚡ {source.detectedPlatform} — {source.suggestion}</p>}
                    {source.error && source.status === 'error' && <p className="text-xs text-red-500 mt-0.5">⚠ {source.error}</p>}
                    {source.lastSync && <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Synced {new Date(source.lastSync).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {source.jobs && source.jobs.length > 0 && <button onClick={() => persist(sources.map(s => s.id === source.id ? { ...s, expanded: !s.expanded } : s))} className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors"><Eye className="w-4 h-4" /></button>}
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors"><ExternalLink className="w-4 h-4" /></a>
                    <button onClick={() => handleRefresh(source)} disabled={source.status === 'detecting'} className="p-1.5 rounded-md text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors disabled:opacity-40"><RefreshCw className={cn('w-4 h-4', source.status === 'detecting' && 'animate-spin')} /></button>
                    {source.status === 'ok' && source.jobCount > 0 && <button onClick={() => handleImport(source)} className="px-3 py-1.5 text-xs font-bold bg-brand-700 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors">Import {source.jobCount}</button>}
                    <button onClick={() => persist(sources.filter(s => s.id !== source.id))} className="p-1.5 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {source.expanded && source.jobs && source.jobs.length > 0 && (
                  <div className="border-t border-stone-100 dark:border-[#1e3a5f]">
                    <div className="px-4 py-2 bg-stone-50 dark:bg-[#162033] flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">Preview — {source.jobs.length} jobs</span>
                      <button onClick={() => persist(sources.map(s => s.id === source.id ? { ...s, expanded: false } : s))} className="text-xs text-stone-400 hover:text-stone-600">collapse</button>
                    </div>
                    {source.jobs.map((job, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors border-b border-stone-50 dark:border-[#162033] last:border-0">
                        <div className="w-7 h-7 shrink-0 rounded-md bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 flex items-center justify-center text-xs font-black">{job.company?.[0]?.toUpperCase() ?? '?'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
                          <p className="text-xs text-stone-400 dark:text-stone-500">{job.company} · {job.location}</p>
                        </div>
                        {job.applyUrl && <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 dark:text-brand-400 hover:underline shrink-0">View ↗</a>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function extractName(url: string): string {
  try { return new URL(url).hostname.replace('www.', '').replace('jobs.', '').split('.')[0]; } catch { return url.slice(0, 30); }
}
