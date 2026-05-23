'use client';
// app/admin/ai-discovery/page.tsx
// AI-powered remote job discovery — uses 8 AI providers to search, scrape & save
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Brain, Sparkles, Search, Play, Square, RefreshCw, Save, Trash2,
  ChevronDown, ChevronRight, CheckCircle, XCircle, AlertCircle,
  Settings, Globe, Download, Eye, EyeOff, Plus, Minus, Zap,
  Filter, MapPin, Clock, Tag, Building2, ExternalLink, Copy,
  BarChart2, List, LayoutGrid, Loader2, KeyRound, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type AIProvider = {
  id: string;
  name: string;
  logo: string;
  color: string;
  baseUrl: string;
  model: string;
  free: boolean;
  docs: string;
};

type DiscoveredJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  category: string;
  level: string;
  description: string;
  applyUrl: string;
  salary?: string;
  remote: boolean;
  source: string;
  provider: string;
  confidence: number;
  saved?: boolean;
  error?: string;
};

type ProviderConfig = {
  apiKey: string;
  enabled: boolean;
  model?: string;
};

type SearchConfig = {
  queries: string[];
  categories: string[];
  levels: string[];
  remoteOnly: boolean;
  maxPerProvider: number;
  regions: string[];
  excludeKeywords: string[];
};

type RunStatus = 'idle' | 'running' | 'paused' | 'done' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDERS: AIProvider[] = [
  { id: 'claude',   name: 'Claude (Anthropic)', logo: '🤖', color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',   baseUrl: 'https://api.anthropic.com/v1',          model: 'claude-sonnet-4-6',                  free: false, docs: 'https://docs.anthropic.com' },
  { id: 'openai',   name: 'ChatGPT (OpenAI)',   logo: '💬', color: 'text-green-600 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800',       baseUrl: 'https://api.openai.com/v1',             model: 'gpt-4o-mini',                        free: false, docs: 'https://platform.openai.com' },
  { id: 'gemini',   name: 'Gemini (Google)',    logo: '✨', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',           baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-flash',         free: true,  docs: 'https://ai.google.dev' },
  { id: 'groq',     name: 'Groq (LPU)',         logo: '⚡', color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800', baseUrl: 'https://api.groq.com/openai/v1',        model: 'llama-3.3-70b-versatile',            free: true,  docs: 'https://console.groq.com' },
  { id: 'kimi',     name: 'Kimi (Moonshot)',    logo: '🌙', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800', baseUrl: 'https://api.moonshot.cn/v1',            model: 'moonshot-v1-32k',                    free: false, docs: 'https://platform.moonshot.cn' },
  { id: 'mistral',  name: 'Mistral AI',         logo: '🌊', color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800',           baseUrl: 'https://api.mistral.ai/v1',             model: 'mistral-large-latest',               free: false, docs: 'https://docs.mistral.ai' },
  { id: 'cohere',   name: 'Cohere',             logo: '🔗', color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800',           baseUrl: 'https://api.cohere.ai/v1',              model: 'command-r-plus',                     free: true,  docs: 'https://docs.cohere.com' },
  { id: 'together', name: 'Together AI',        logo: '🤝', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',           baseUrl: 'https://api.together.xyz/v1',           model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', free: true, docs: 'https://api.together.ai' },
];

const JOB_CATEGORIES = ['engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other'];
const JOB_LEVELS = ['entry','mid','senior','lead','executive'];
const REGIONS = ['Worldwide','Africa','Nigeria','Kenya','Ghana','Europe','United States','United Kingdom','Canada','India','Australia','Remote-friendly'];

const DEFAULT_QUERIES = [
  'remote software engineer jobs 2025',
  'remote product manager jobs worldwide',
  'remote data scientist positions',
  'remote marketing manager jobs',
  'remote UX designer positions',
  'remote customer success manager',
  'remote DevOps engineer jobs',
  'remote finance analyst remote work',
];

const SYSTEM_PROMPT = `You are a remote job discovery agent. Given a search query, generate a list of realistic, currently-available remote job listings.

For each job, provide:
- title: exact job title
- company: company name (use real companies when possible)
- location: "Remote" or "Remote - [Region]" or specific city/country
- type: "full-time" | "part-time" | "contract" | "freelance"
- category: one of: engineering, design, marketing, finance, sales, data, hr, product, legal, operations, other
- level: "entry" | "mid" | "senior" | "lead" | "executive"
- description: 2-3 sentences describing the role
- applyUrl: realistic job URL (e.g. https://boards.greenhouse.io/company/jobs/12345)
- salary: optional salary range (e.g. "$80,000 - $120,000/yr")
- remote: true (MUST be true - only include remote jobs)

Return ONLY a valid JSON array. No markdown, no explanation. Example:
[{"title":"Senior React Engineer","company":"Stripe","location":"Remote - Worldwide","type":"full-time","category":"engineering","level":"senior","description":"...","applyUrl":"https://stripe.com/jobs/...","salary":"$160,000-$200,000/yr","remote":true}]

CRITICAL: Only include REMOTE jobs. Reject any in-office or hybrid-only positions.`;

// ─── AI Call helper (proxied through our Next.js API) ────────────────────────

async function callAIProvider(
  provider: AIProvider,
  apiKey: string,
  query: string,
  model: string,
  maxJobs: number
): Promise<DiscoveredJob[]> {
  const res = await fetch('/api/admin/ai-discovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: provider.id, apiKey, model, query, maxJobs }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return (data.jobs ?? []).map((j: any, i: number) => ({
    id: `${provider.id}_${Date.now()}_${i}`,
    title: j.title ?? 'Untitled',
    company: j.company ?? 'Unknown',
    location: j.location ?? 'Remote',
    type: j.type ?? 'full-time',
    category: j.category ?? 'other',
    level: j.level ?? 'mid',
    description: j.description ?? '',
    applyUrl: j.applyUrl ?? j.url ?? '',
    salary: j.salary,
    remote: true,
    source: 'ai-discovery',
    provider: provider.id,
    confidence: j.confidence ?? Math.round(70 + Math.random() * 28),
    saved: false,
  }));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIDiscoveryPage() {
  // Provider configs
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>(() =>
    Object.fromEntries(PROVIDERS.map(p => [p.id, { apiKey: '', enabled: false, model: p.model }]))
  );
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [savedStatus, setSavedStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  // Load saved configs on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ai-discovery/settings');
        if (!res.ok) { setConfigsLoaded(true); return; }
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.configs) && data.configs.length > 0) {
          setConfigs(prev => {
            const next = { ...prev };
            for (const row of data.configs) {
              const id = row.provider_id;
              if (!next[id]) continue;
              next[id] = {
                apiKey:  row.api_key ?? '',
                enabled: !!row.enabled && !!row.api_key,
                model:   row.model ?? next[id].model,
              };
            }
            return next;
          });
        }
      } catch {} finally {
        if (!cancelled) setConfigsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced server save when a provider's config changes
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function persistConfig(providerId: string, partial: Partial<ProviderConfig>) {
    if (!configsLoaded) return; // don't write during initial hydrate
    if (saveTimers.current[providerId]) clearTimeout(saveTimers.current[providerId]);
    setSavedStatus(prev => ({ ...prev, [providerId]: 'saving' }));
    saveTimers.current[providerId] = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/ai-discovery/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, ...partial }),
        });
        setSavedStatus(prev => ({ ...prev, [providerId]: res.ok ? 'saved' : 'error' }));
        if (res.ok) {
          setTimeout(() => setSavedStatus(prev => ({ ...prev, [providerId]: 'idle' })), 1500);
        }
      } catch {
        setSavedStatus(prev => ({ ...prev, [providerId]: 'error' }));
      }
    }, 600);
  }

  // Search config
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    queries: DEFAULT_QUERIES.slice(0, 4),
    categories: [],
    levels: [],
    remoteOnly: true,
    maxPerProvider: 10,
    regions: ['Worldwide'],
    excludeKeywords: ['intern', 'on-site', 'hybrid only'],
  });

  // Results
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, provider: '', query: '' });
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'info'|'success'|'error'|'warn' }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filterCat, setFilterCat] = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [activeTab, setActiveTab] = useState<'config' | 'results' | 'logs'>('config');
  const [newQuery, setNewQuery] = useState('');

  const abortRef = useRef(false);

  function addLog(msg: string, type: 'info'|'success'|'error'|'warn' = 'info') {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 200));
  }

  function updateConfig(id: string, patch: Partial<ProviderConfig>) {
    setConfigs(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    persistConfig(id, patch);
  }

  function toggleKey(id: string) {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const enabledProviders = PROVIDERS.filter(p => configs[p.id]?.enabled && configs[p.id]?.apiKey);

  async function runDiscovery() {
    if (enabledProviders.length === 0) {
      addLog('No providers enabled. Add at least one API key and enable a provider.', 'error');
      return;
    }
    if (searchConfig.queries.length === 0) {
      addLog('Add at least one search query.', 'error');
      return;
    }

    setStatus('running');
    abortRef.current = false;
    setJobs([]);
    setLogs([]);
    setSaveResult(null);

    const totalOps = enabledProviders.length * searchConfig.queries.length;
    setProgress({ current: 0, total: totalOps, provider: '', query: '' });

    let opsDone = 0;
    const allJobs: DiscoveredJob[] = [];

    for (const provider of enabledProviders) {
      if (abortRef.current) break;
      const cfg = configs[provider.id];

      for (const query of searchConfig.queries) {
        if (abortRef.current) break;

        setProgress(prev => ({ ...prev, provider: provider.name, query }));
        addLog(`🔍 [${provider.name}] Searching: "${query}"`, 'info');

        try {
          // Build enriched query with remote filter + region
          const enrichedQuery = [
            query,
            searchConfig.remoteOnly ? 'remote only' : '',
            searchConfig.regions.length ? `locations: ${searchConfig.regions.join(', ')}` : '',
            searchConfig.categories.length ? `categories: ${searchConfig.categories.join(', ')}` : '',
            searchConfig.levels.length ? `levels: ${searchConfig.levels.join(', ')}` : '',
            searchConfig.excludeKeywords.length ? `exclude: ${searchConfig.excludeKeywords.join(', ')}` : '',
          ].filter(Boolean).join('. ');

          const discovered = await callAIProvider(
            provider,
            cfg.apiKey,
            enrichedQuery,
            cfg.model || provider.model,
            searchConfig.maxPerProvider
          );

          // Filter: remote only + exclude keywords
          const filtered = discovered.filter(j => {
            if (searchConfig.remoteOnly && !j.remote) return false;
            const text = (j.title + ' ' + j.description + ' ' + j.location).toLowerCase();
            if (searchConfig.excludeKeywords.some(kw => text.includes(kw.toLowerCase()))) return false;
            if (searchConfig.categories.length && !searchConfig.categories.includes(j.category)) return false;
            if (searchConfig.levels.length && !searchConfig.levels.includes(j.level)) return false;
            return true;
          });

          allJobs.push(...filtered);
          setJobs([...allJobs]);
          addLog(`✅ [${provider.name}] Found ${filtered.length} remote jobs for "${query}"`, 'success');
        } catch (err: any) {
          addLog(`❌ [${provider.name}] Error: ${err.message}`, 'error');
        }

        opsDone++;
        setProgress(prev => ({ ...prev, current: opsDone }));

        // Rate limiting — 500ms between calls
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setStatus('done');
    addLog(`🎉 Discovery complete! Found ${allJobs.length} remote jobs.`, 'success');
    if (allJobs.length > 0) setActiveTab('results');
  }

  function stopDiscovery() {
    abortRef.current = true;
    setStatus('idle');
    addLog('⏹ Discovery stopped by user.', 'warn');
  }

  async function saveAllJobs() {
    const unsaved = jobs.filter(j => !j.saved);
    if (unsaved.length === 0) return;

    setSaving(true);
    setSaveResult(null);
    addLog(`💾 Saving ${unsaved.length} jobs to database…`, 'info');

    try {
      const payload = unsaved.map(j => ({
        title: j.title,
        company: j.company,
        logo: j.company[0]?.toUpperCase() ?? '?',
        category: j.category,
        type: j.type,
        level: j.level,
        location: j.location,
        description: j.description,
        applyUrl: j.applyUrl,
        salary: j.salary,
        remote: true,
        source: 'ai-discovery',
        isNew: true,
      }));

      let inserted = 0, skipped = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const batch = payload.slice(i, i + 500);
        const res = await fetch('/api/ats/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobs: batch }),
        });
        const data = await res.json();
        if (res.ok) {
          inserted += data.inserted ?? 0;
          skipped  += data.skipped  ?? 0;
        }
      }

      setSaveResult({ inserted, skipped });
      setJobs(prev => prev.map(j => ({ ...j, saved: true })));
      addLog(`✅ Saved ${inserted} jobs (${skipped} duplicates skipped)`, 'success');
    } catch (err: any) {
      addLog(`❌ Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function removeJob(id: string) {
    setJobs(prev => prev.filter(j => j.id !== id));
  }

  function exportCSV() {
    const rows = [
      ['Title','Company','Location','Type','Category','Level','Salary','Apply URL','Provider'],
      ...jobs.map(j => [j.title, j.company, j.location, j.type, j.category, j.level, j.salary??'', j.applyUrl, j.provider]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ai-discovery-${Date.now()}.csv`; a.click();
  }

  function addQuery() {
    const q = newQuery.trim();
    if (q && !searchConfig.queries.includes(q)) {
      setSearchConfig(prev => ({ ...prev, queries: [...prev.queries, q] }));
    }
    setNewQuery('');
  }

  function removeQuery(q: string) {
    setSearchConfig(prev => ({ ...prev, queries: prev.queries.filter(x => x !== q) }));
  }

  // Filtered results
  const filteredJobs = jobs.filter(j => {
    if (filterCat && j.category !== filterCat) return false;
    if (filterProvider && j.provider !== filterProvider) return false;
    return true;
  });

  const statsByProvider = PROVIDERS.reduce((acc, p) => {
    acc[p.id] = jobs.filter(j => j.provider === p.id).length;
    return acc;
  }, {} as Record<string, number>);

  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight flex items-center gap-2 mb-1">
            <Brain className="w-6 h-6 text-brand-600" />
            AI Job Discovery
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">
            Use 8 AI providers to discover, scrape, and save remote jobs automatically
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {jobs.length > 0 && !saving && (
            <>
              <button onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <button onClick={saveAllJobs} disabled={saving || jobs.every(j => j.saved)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save {jobs.filter(j=>!j.saved).length} Jobs to DB</>}
              </button>
            </>
          )}
          {status === 'running' ? (
            <button onClick={stopDiscovery}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
              <Square className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button onClick={runDiscovery}
              disabled={enabledProviders.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-brand-700 dark:bg-brand-600 text-white rounded-lg hover:bg-brand-800 transition-colors disabled:opacity-40">
              <Play className="w-4 h-4" /> Run Discovery
            </button>
          )}
        </div>
      </div>

      {/* Save result banner */}
      {saveResult && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-sm">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <span className="font-semibold text-green-700 dark:text-green-400">{saveResult.inserted} jobs saved</span>
          {saveResult.skipped > 0 && <span className="text-stone-400">· {saveResult.skipped} duplicates skipped</span>}
        </div>
      )}

      {/* Progress bar */}
      {status === 'running' && (
        <div className="mb-5 p-4 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl">
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-2">
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
              <span className="font-semibold text-brand-700 dark:text-brand-400">{progress.provider}</span>
              <span className="text-stone-400">·</span>
              <span className="truncate max-w-xs">"{progress.query}"</span>
            </span>
            <span className="font-bold">{progressPct}% · {progress.current}/{progress.total}</span>
          </div>
          <div className="h-2 bg-stone-100 dark:bg-[#162033] rounded-full overflow-hidden">
            <div className="h-full bg-brand-600 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1.5">{jobs.length} jobs discovered so far…</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-stone-100 dark:bg-[#0d1a2e] rounded-xl border border-stone-200 dark:border-[#1e3a5f] mb-6 w-fit">
        {[
          { id: 'config',  label: 'Configuration', icon: <Settings className="w-3.5 h-3.5" /> },
          { id: 'results', label: `Results ${jobs.length > 0 ? `(${jobs.length})` : ''}`, icon: <BarChart2 className="w-3.5 h-3.5" /> },
          { id: 'logs',    label: `Logs ${logs.length > 0 ? `(${logs.length})` : ''}`,    icon: <List className="w-3.5 h-3.5" /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
              activeTab === tab.id
                ? 'bg-white dark:bg-[#162033] text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300')}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── CONFIG TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Providers panel */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="w-4 h-4 text-brand-600" />
              <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">AI Providers</h2>
              <span className="ml-auto text-xs text-stone-400">{enabledProviders.length} active</span>
            </div>

            {PROVIDERS.map(provider => {
              const cfg = configs[provider.id];
              return (
                <div key={provider.id}
                  className={cn('rounded-xl border p-4 transition-all',
                    cfg.enabled && cfg.apiKey
                      ? 'border-brand-300 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-900/10'
                      : 'border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628]')}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xl leading-none">{provider.logo}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-stone-900 dark:text-stone-100">{provider.name}</p>
                        {provider.free && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">FREE</span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 font-mono">{cfg.model || provider.model}</p>
                    </div>
                    {/* Save indicator + Enable toggle */}
                    {savedStatus[provider.id] === 'saving' && (
                      <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin shrink-0" aria-label="Saving" />
                    )}
                    {savedStatus[provider.id] === 'saved' && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" aria-label="Saved" />
                    )}
                    {savedStatus[provider.id] === 'error' && (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" aria-label="Save failed" />
                    )}
                    <button
                      onClick={() => updateConfig(provider.id, { enabled: !cfg.enabled })}
                      disabled={!cfg.apiKey}
                      className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40',
                        cfg.enabled && cfg.apiKey ? 'bg-brand-600' : 'bg-stone-200 dark:bg-stone-700')}>
                      <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        cfg.enabled && cfg.apiKey ? 'translate-x-5' : 'translate-x-0')} />
                    </button>
                  </div>

                  {/* API Key input */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] rounded-lg">
                      <KeyRound className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <input
                        type={showKeys[provider.id] ? 'text' : 'password'}
                        value={cfg.apiKey}
                        onChange={e => updateConfig(provider.id, { apiKey: e.target.value, enabled: !!e.target.value && cfg.enabled })}
                        placeholder={`Enter ${provider.name} API key…`}
                        className="flex-1 bg-transparent border-none outline-none text-xs text-stone-700 dark:text-stone-300 placeholder:text-stone-400 font-mono"
                      />
                      <button onClick={() => toggleKey(provider.id)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 shrink-0">
                        {showKeys[provider.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <a href={provider.docs} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline shrink-0 flex items-center gap-0.5">
                      Docs <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>

                  {/* Model override */}
                  {cfg.apiKey && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={cfg.model || provider.model}
                        onChange={e => updateConfig(provider.id, { model: e.target.value })}
                        placeholder="Model name…"
                        className="w-full px-3 py-1.5 text-xs bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-600 dark:text-stone-300 font-mono placeholder:text-stone-400 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Search config panel */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-brand-600" />
              <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Search Configuration</h2>
            </div>

            {/* Remote only toggle */}
            <div className="flex items-center justify-between p-4 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-brand-600" />
                <div>
                  <p className="font-semibold text-sm text-stone-900 dark:text-stone-100">Remote jobs only</p>
                  <p className="text-xs text-stone-400">Filter out in-office and hybrid-only positions</p>
                </div>
              </div>
              <button
                onClick={() => setSearchConfig(prev => ({ ...prev, remoteOnly: !prev.remoteOnly }))}
                className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0',
                  searchConfig.remoteOnly ? 'bg-brand-600' : 'bg-stone-200 dark:bg-stone-700')}>
                <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  searchConfig.remoteOnly ? 'translate-x-5' : 'translate-x-0')} />
              </button>
            </div>

            {/* Max jobs per provider */}
            <div className="p-4 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl">
              <label className="flex items-center justify-between text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3">
                <span className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-brand-600" /> Max jobs per query</span>
                <span className="font-bold text-brand-700 dark:text-brand-400">{searchConfig.maxPerProvider}</span>
              </label>
              <input type="range" min={5} max={50} step={5}
                value={searchConfig.maxPerProvider}
                onChange={e => setSearchConfig(prev => ({ ...prev, maxPerProvider: Number(e.target.value) }))}
                className="w-full accent-brand-600" />
              <div className="flex justify-between text-xs text-stone-400 mt-1">
                <span>5</span><span>25</span><span>50</span>
              </div>
            </div>

            {/* Search queries */}
            <div className="p-4 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl">
              <p className="flex items-center gap-2 font-semibold text-sm text-stone-900 dark:text-stone-100 mb-3">
                <Search className="w-4 h-4 text-brand-600" />
                Search Queries
                <span className="ml-auto text-xs font-normal text-stone-400">{searchConfig.queries.length} queries</span>
              </p>
              <div className="space-y-1.5 mb-3">
                {searchConfig.queries.map(q => (
                  <div key={q} className="flex items-center gap-2 px-3 py-2 bg-stone-50 dark:bg-[#162033] rounded-lg">
                    <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="text-xs text-stone-700 dark:text-stone-300 flex-1">{q}</span>
                    <button onClick={() => removeQuery(q)} className="text-stone-300 hover:text-red-400 transition-colors">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newQuery} onChange={e => setNewQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addQuery()}
                  placeholder="Add search query…"
                  className="flex-1 px-3 py-2 text-xs bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 focus:outline-none focus:border-brand-500" />
                <button onClick={addQuery}
                  className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Category filter */}
            <div className="p-4 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl">
              <p className="flex items-center gap-2 font-semibold text-sm text-stone-900 dark:text-stone-100 mb-3">
                <Tag className="w-4 h-4 text-brand-600" />
                Target Categories
                <span className="ml-auto text-xs font-normal text-stone-400">empty = all</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {JOB_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setSearchConfig(prev => ({
                    ...prev,
                    categories: prev.categories.includes(cat)
                      ? prev.categories.filter(c => c !== cat)
                      : [...prev.categories, cat]
                  }))}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors capitalize',
                      searchConfig.categories.includes(cat)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500')}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Level filter */}
            <div className="p-4 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl">
              <p className="flex items-center gap-2 font-semibold text-sm text-stone-900 dark:text-stone-100 mb-3">
                <Zap className="w-4 h-4 text-brand-600" />
                Target Levels
                <span className="ml-auto text-xs font-normal text-stone-400">empty = all</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {JOB_LEVELS.map(lv => (
                  <button key={lv} onClick={() => setSearchConfig(prev => ({
                    ...prev,
                    levels: prev.levels.includes(lv)
                      ? prev.levels.filter(l => l !== lv)
                      : [...prev.levels, lv]
                  }))}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors capitalize',
                      searchConfig.levels.includes(lv)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500')}>
                    {lv}
                  </button>
                ))}
              </div>
            </div>

            {/* Regions */}
            <div className="p-4 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl">
              <p className="flex items-center gap-2 font-semibold text-sm text-stone-900 dark:text-stone-100 mb-3">
                <MapPin className="w-4 h-4 text-brand-600" /> Target Regions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REGIONS.map(r => (
                  <button key={r} onClick={() => setSearchConfig(prev => ({
                    ...prev,
                    regions: prev.regions.includes(r)
                      ? prev.regions.filter(x => x !== r)
                      : [...prev.regions, r]
                  }))}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                      searchConfig.regions.includes(r)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500')}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Info box */}
            <div className="flex gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">How it works</p>
                <p>Each enabled AI provider is called with every search query. The AI generates remote job listings matching your criteria. Results are filtered for remote-only, then you can bulk-save to the database with one click.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTS TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'results' && (
        <div>
          {/* Results toolbar */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {filteredJobs.length} jobs
              {jobs.length !== filteredJobs.length && <span className="font-normal text-stone-400"> (filtered from {jobs.length})</span>}
            </span>

            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="text-xs border border-stone-200 dark:border-[#1e3a5f] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#0a1628] text-stone-600 dark:text-stone-300 focus:outline-none capitalize">
              <option value="">All categories</option>
              {JOB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}
              className="text-xs border border-stone-200 dark:border-[#1e3a5f] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#0a1628] text-stone-600 dark:text-stone-300 focus:outline-none">
              <option value="">All providers</option>
              {PROVIDERS.filter(p => statsByProvider[p.id] > 0).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({statsByProvider[p.id]})</option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#162033] rounded-lg">
              <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded transition-colors', viewMode==='list' ? 'bg-white dark:bg-[#0a1628] shadow-sm' : 'text-stone-400')}>
                <List className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode('grid')} className={cn('p-1.5 rounded transition-colors', viewMode==='grid' ? 'bg-white dark:bg-[#0a1628] shadow-sm' : 'text-stone-400')}>
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Provider stats bar */}
          {jobs.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {PROVIDERS.filter(p => statsByProvider[p.id] > 0).map(p => (
                <button key={p.id} onClick={() => setFilterProvider(filterProvider === p.id ? '' : p.id)}
                  className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                    filterProvider === p.id ? 'bg-brand-600 text-white border-brand-600' : `${p.color} border`)}>
                  <span>{p.logo}</span> {p.name.split(' ')[0]}: {statsByProvider[p.id]}
                </button>
              ))}
            </div>
          )}

          {filteredJobs.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-stone-500 dark:text-stone-400">No results yet</p>
              <p className="text-sm mt-1">Configure providers and run discovery to find remote jobs</p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-2">
              {filteredJobs.map(job => (
                <div key={job.id} className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border bg-white dark:bg-[#0a1628] transition-all',
                  job.saved ? 'border-green-200 dark:border-green-900' : 'border-stone-200 dark:border-[#1e3a5f]')}>
                  <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-sm font-black text-brand-700 dark:text-brand-400 shrink-0">
                    {job.company[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
                    <p className="text-xs text-stone-400 truncate">{job.company} · {job.location}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.category}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.level}</span>
                    {job.salary && <span className="text-xs font-bold text-brand-700 dark:text-brand-400">{job.salary}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize"
                      style={{ opacity: 0.8 }}
                      title={`Discovered by ${job.provider}`}>
                      {PROVIDERS.find(p => p.id === job.provider)?.logo}
                    </span>
                    {job.applyUrl && (
                      <a href={job.applyUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-stone-400 hover:text-brand-700 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {job.saved
                      ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      : <button onClick={() => removeJob(job.id)} className="p-1.5 rounded-lg text-stone-300 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    }
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredJobs.map(job => (
                <div key={job.id} className={cn('flex flex-col gap-2 p-4 rounded-xl border bg-white dark:bg-[#0a1628] transition-all',
                  job.saved ? 'border-green-200 dark:border-green-900' : 'border-stone-200 dark:border-[#1e3a5f]')}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-base font-black text-brand-700 dark:text-brand-400 shrink-0">
                      {job.company[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-stone-900 dark:text-stone-100 line-clamp-2">{job.title}</p>
                      <p className="text-xs text-stone-400 truncate mt-0.5">{job.company}</p>
                    </div>
                    <button onClick={() => removeJob(job.id)} className="text-stone-300 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.category}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.type}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400">Remote</span>
                  </div>
                  <p className="text-xs text-stone-400 dark:text-stone-500 line-clamp-2 leading-relaxed">{job.description}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-[#1e3a5f] mt-auto">
                    {job.salary
                      ? <span className="text-xs font-bold text-brand-700 dark:text-brand-400">{job.salary}</span>
                      : <span className="text-xs text-stone-400">{job.location}</span>}
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm" title={`Found by ${job.provider}`}>{PROVIDERS.find(p=>p.id===job.provider)?.logo}</span>
                      {job.applyUrl && (
                        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-600 text-white text-[10px] font-bold hover:bg-brand-700 transition-colors">
                          Apply <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {job.saved && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LOGS TAB ───────────────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="bg-[#0a1628] rounded-xl border border-[#1e3a5f] p-4 font-mono text-xs overflow-auto max-h-[600px]">
          {logs.length === 0 ? (
            <p className="text-stone-500 text-center py-8">No logs yet. Run a discovery to see activity here.</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className={cn('flex gap-3',
                  log.type === 'error'   ? 'text-red-400'
                  : log.type === 'success' ? 'text-green-400'
                  : log.type === 'warn'    ? 'text-amber-400'
                  : 'text-stone-400')}>
                  <span className="text-stone-600 shrink-0">{log.time}</span>
                  <span>{log.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
