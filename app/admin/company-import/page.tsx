'use client';
// app/admin/company-import/page.tsx
// Paste up to 25,000 career page URLs at once → auto-detects ATS → pulls all jobs.
// The page is engineered to handle 10k+ URLs without melting the browser:
//   - concurrent worker pool (8 in-flight at a time) instead of a serial loop
//   - batched setState (per-entry patches flushed every 250ms) so 10k results
//     don't trigger 10k full re-renders
//   - memoised filtered list + stats (cuts O(n) scans on every keystroke)
//   - render cap on the table (only the first MAX_RENDERED_ROWS show) so the
//     DOM stays small; filter/search the list to drill in
//   - localStorage persistence so a browser refresh resumes the scrape
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
// Throttled snapshot of the current import session — lets the user refresh
// the browser without losing their place. We strip the heavy `jobs` arrays
// before persisting (a finished 10k-company scrape would be tens of MB
// otherwise and exceed the localStorage quota).
const IMPORT_STATE_KEY = 'rj44-scrape-state-v1';

// Tunables. Higher concurrency = faster scrape but more memory + more risk
// of getting rate-limited by individual ATSes. 8 has been a comfortable
// ceiling in practice; bump if you trust the ATSes you're hitting.
const URL_LIMIT          = 25_000;
const MAX_RENDERED_ROWS  = 300;   // table caps at this; use filters to drill in
const FETCH_CONCURRENCY  = 8;
const SAVE_CONCURRENCY   = 3;
const SAVE_BATCH_SIZE    = 500;
const STATE_FLUSH_MS     = 250;   // batched setEntries cadence

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  greenhouse:      { label: 'Greenhouse',      color: 'text-brand-700 bg-brand-50 dark:text-brand-400 dark:bg-brand-900/20' },
  lever:           { label: 'Lever',           color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  ashby:           { label: 'Ashby',           color: 'text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
  workable:        { label: 'Workable',        color: 'text-cyan-700 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/20' },
  recruitee:       { label: 'Recruitee',       color: 'text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20' },
  workday:         { label: 'Workday',         color: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/20' },
  smartrecruiters: { label: 'SmartRecruiters', color: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' },
  // ── "20 more" batch ──────────────────────────────────────────────────
  personio:        { label: 'Personio',        color: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/20' },
  bamboohr:        { label: 'BambooHR',        color: 'text-lime-700 bg-lime-50 dark:text-lime-400 dark:bg-lime-900/20' },
  jazzhr:          { label: 'JazzHR',          color: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
  breezy:          { label: 'Breezy',          color: 'text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-900/20' },
  comeet:          { label: 'Comeet',          color: 'text-pink-700 bg-pink-50 dark:text-pink-400 dark:bg-pink-900/20' },
  jobvite:         { label: 'Jobvite',         color: 'text-indigo-700 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-900/20' },
  icims:           { label: 'iCIMS',           color: 'text-teal-700 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/20' },
  recruiterbox:    { label: 'Recruiterbox',    color: 'text-fuchsia-700 bg-fuchsia-50 dark:text-fuchsia-400 dark:bg-fuchsia-900/20' },
  jobscore:        { label: 'JobScore',        color: 'text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20' },
  zohorecruit:     { label: 'Zoho Recruit',    color: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20' },
  teamtailor:      { label: 'Teamtailor',      color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  manatal:         { label: 'Manatal',         color: 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20' },
  pinpoint:        { label: 'Pinpoint',        color: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/20' },
  jobadder:        { label: 'JobAdder',        color: 'text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20' },
  talentlyft:      { label: 'TalentLyft',      color: 'text-cyan-700 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/20' },
  heyrecruit:      { label: 'Heyrecruit',      color: 'text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
  vivahr:          { label: 'VivaHR',          color: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' },
  polymer:         { label: 'Polymer',         color: 'text-slate-700 bg-slate-50 dark:text-slate-400 dark:bg-slate-900/20' },
  taleo:           { label: 'Taleo',           color: 'text-stone-700 bg-stone-50 dark:text-stone-400 dark:bg-stone-900/20' },
  successfactors:  { label: 'SuccessFactors',  color: 'text-blue-800 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20' },
  // ── "25 more" batch ──────────────────────────────────────────────────
  bullhorn:        { label: 'Bullhorn',        color: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20' },
  crelate:         { label: 'Crelate',         color: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/20' },
  newton:          { label: 'Newton',          color: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
  cornerstone:     { label: 'Cornerstone',     color: 'text-indigo-700 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-900/20' },
  ukgpro:          { label: 'UKG Pro',         color: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' },
  adp:             { label: 'ADP',             color: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/20' },
  paylocity:       { label: 'Paylocity',       color: 'text-cyan-700 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/20' },
  loxo:            { label: 'Loxo',            color: 'text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20' },
  vincere:         { label: 'Vincere',         color: 'text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
  avature:         { label: 'Avature',         color: 'text-pink-700 bg-pink-50 dark:text-pink-400 dark:bg-pink-900/20' },
  eightfold:       { label: 'Eightfold',       color: 'text-fuchsia-700 bg-fuchsia-50 dark:text-fuchsia-400 dark:bg-fuchsia-900/20' },
  phenom:          { label: 'Phenom',          color: 'text-teal-700 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/20' },
  beamery:         { label: 'Beamery',         color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  hireology:       { label: 'Hireology',       color: 'text-lime-700 bg-lime-50 dark:text-lime-400 dark:bg-lime-900/20' },
  clearcompany:    { label: 'ClearCompany',    color: 'text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-900/20' },
  hrpartner:       { label: 'HrPartner',       color: 'text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20' },
  recooty:         { label: 'Recooty',         color: 'text-brand-700 bg-brand-50 dark:text-brand-400 dark:bg-brand-900/20' },
  skeeled:         { label: 'Skeeled',         color: 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20' },
  hibob:           { label: 'HiBob',           color: 'text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
  pcrecruiter:     { label: 'PCRecruiter',     color: 'text-stone-700 bg-stone-50 dark:text-stone-400 dark:bg-stone-900/20' },
  catsone:         { label: 'CATS One',        color: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
  recruitcrm:      { label: 'Recruit CRM',     color: 'text-blue-800 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20' },
  sagepeople:      { label: 'Sage People',     color: 'text-green-800 bg-green-50 dark:text-green-300 dark:bg-green-900/20' },
  workzoom:        { label: 'Workzoom',        color: 'text-indigo-800 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-900/20' },
  hireserve:       { label: 'Hireserve',       color: 'text-emerald-800 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/20' },
  unknown:         { label: 'Unknown',         color: 'text-stone-500 bg-stone-100 dark:bg-stone-800' },
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

  // ── Refs used by the worker pool + state batching ──────────────────────
  // entriesRef mirrors `entries` so the in-flight fetch workers can see the
  // freshest state without forcing them into a setEntries closure on every
  // tick. pendingPatchesRef accumulates per-entry updates and flushes via
  // a single setEntries call every STATE_FLUSH_MS so 10k results don't
  // trigger 10k full re-renders.
  const entriesRef        = useRef<CompanyEntry[]>([]);
  const pendingPatchesRef = useRef<Map<string, Partial<CompanyEntry>>>(new Map());
  const flushTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{ count: number } | null>(null);

  // Keep entriesRef in sync so workers always see the live list.
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // Schedule a batched flush. Multiple callers within STATE_FLUSH_MS coalesce
  // into one setEntries pass — O(n) instead of O(n) per worker callback.
  const queuePatch = useCallback((id: string, patch: Partial<CompanyEntry>) => {
    const map = pendingPatchesRef.current;
    map.set(id, { ...(map.get(id) ?? {}), ...patch });
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const patches = pendingPatchesRef.current;
      if (patches.size === 0) return;
      pendingPatchesRef.current = new Map();
      setEntries(prev => prev.map(e => {
        const p = patches.get(e.id);
        return p ? { ...e, ...p } : e;
      }));
    }, STATE_FLUSH_MS);
  }, []);

  // Snapshot of the import session — heavy job payloads stripped so the
  // record fits in localStorage even for a 10k scrape. We persist URL + id
  // + status + counts so the user can refresh and resume from where they
  // left off (the actual jobs[] will be re-fetched when they click Resume).
  const persistState = useCallback((toPersist: CompanyEntry[]) => {
    try {
      const slim = toPersist.map(e => ({
        id: e.id, url: e.url, name: e.name, platform: e.platform, slug: e.slug,
        apiEndpoint: e.apiEndpoint, confidence: e.confidence,
        status: e.status, jobCount: e.jobCount, error: e.error,
      }));
      localStorage.setItem(IMPORT_STATE_KEY, JSON.stringify({
        at: Date.now(),
        entries: slim,
      }));
    } catch {
      // localStorage quota or serialization — non-fatal, just skip this snapshot.
    }
  }, []);

  // Load scrape history + offer to resume any in-flight import.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
    try {
      const snap = localStorage.getItem(IMPORT_STATE_KEY);
      if (snap) {
        const parsed = JSON.parse(snap);
        const arr: CompanyEntry[] = Array.isArray(parsed?.entries) ? parsed.entries : [];
        const unfinished = arr.filter(e => e.status === 'fetching' || e.status === 'ready');
        if (unfinished.length > 0) setResumePrompt({ count: unfinished.length });
        // Stash the parsed snapshot on the window so the Resume click below
        // can grab it without a second localStorage read.
        (window as any).__rj44_import_snapshot = arr;
      }
    } catch {}
  }, []);

  // Snapshot the session every time entries change — throttled so a fast
  // sequence of patches doesn't thrash localStorage. We rely on the natural
  // batching of STATE_FLUSH_MS (entries only changes after a flush).
  useEffect(() => {
    if (entries.length === 0) return;
    persistState(entries);
  }, [entries, persistState]);

  function resumeFromSnapshot() {
    const snap: CompanyEntry[] | undefined = (window as any).__rj44_import_snapshot;
    if (!snap) { setResumePrompt(null); return; }
    // Reset 'fetching' rows back to 'ready' so the worker pool re-picks them.
    const restored = snap.map(e => ({
      ...e,
      status: (e.status === 'fetching' ? 'ready' : e.status) as DetectStatus,
      expanded: false,
      jobs: [],
    }));
    setEntries(restored);
    setResumePrompt(null);
  }

  function discardSnapshot() {
    try { localStorage.removeItem(IMPORT_STATE_KEY); } catch {}
    delete (window as any).__rj44_import_snapshot;
    setResumePrompt(null);
  }

  // Parse URLs from input (handles newlines, commas, spaces, tabs).
  // The cap is generous — 25k URLs is the realistic ceiling before browser
  // JSON parsing and DOM rendering start to bite even with the optimisations
  // below.
  function parseUrls(raw: string): string[] {
    return raw
      .split(/[\n,\t]+/)
      .map(u => u.trim())
      .filter(u => u.startsWith('http') && u.length > 10)
      .slice(0, URL_LIMIT);
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
  // Worker-pool design: FETCH_CONCURRENCY async loops share a single index
  // counter, each pulling the next eligible entry from entriesRef. That's
  // real concurrency (8 in-flight requests) rather than a serial loop with
  // a sleep between batches. Every per-entry update goes through queuePatch
  // so 10k workers don't trigger 10k full setEntries calls.
  //
  // We also process status='pending' entries (URLs whose ATS couldn't be
  // detected from the URL alone, e.g. fireworks.ai/careers). The backend
  // /api/ats?url= path fetches the HTML and finds embedded ATS links so
  // unknown URLs often still resolve to jobs.
  async function fetchAll() {
    if (running) { pauseRef.current = !pauseRef.current; setPaused(p => !p); return; }
    setRunning(true);
    setPaused(false);
    abortRef.current = false;
    pauseRef.current = false;

    // Snapshot the eligible-to-fetch ids from the current list. Workers walk
    // this fixed queue rather than re-scanning entries on every iteration.
    const queue = entriesRef.current
      .filter(e => e.status === 'ready' || e.status === 'error' || e.status === 'pending')
      .map(e => e.id);
    let cursor = 0;
    const nextId = (): string | null => {
      if (abortRef.current) return null;
      if (cursor >= queue.length) return null;
      return queue[cursor++];
    };

    async function processOne(entryId: string) {
      // Re-read the latest version of the row from entriesRef in case a
      // resume-from-snapshot or other side-channel updated it.
      const live = entriesRef.current.find(e => e.id === entryId);
      if (!live) return;

      queuePatch(entryId, { status: 'fetching' });

      try {
        const params = live.platform !== 'unknown' && live.slug
          ? `/api/ats?platform=${live.platform}&slug=${live.slug}`
          : `/api/ats?url=${encodeURIComponent(live.url)}`;
        const res = await fetch(params);
        const data = await res.json();
        const allJobs = data.jobs ?? [];
        queuePatch(entryId, {
          status:   data.error ? 'error' : 'done',
          jobCount: data.total ?? allJobs.length,
          jobs:     allJobs,
          jobsPreview: allJobs.slice(0, 10),
          error:    data.error,
          platform: data.platform ?? live.platform,
          slug:     data.slug ?? live.slug,
        });
        if (!data.error && data.total > 0) {
          setTotalImported(t => t + (data.total ?? 0));
        }
      } catch (err: any) {
        queuePatch(entryId, { status: 'error', error: err.message ?? String(err) });
      }
    }

    async function worker() {
      while (true) {
        while (pauseRef.current) await sleep(300);
        if (abortRef.current) return;
        const id = nextId();
        if (id == null) return;
        await processOne(id);
      }
    }

    const workers = Array.from({ length: FETCH_CONCURRENCY }, () => worker());
    await Promise.all(workers);

    // Final flush in case the last batch of patches is still pending.
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      const patches = pendingPatchesRef.current;
      pendingPatchesRef.current = new Map();
      if (patches.size > 0) {
        setEntries(prev => prev.map(e => {
          const p = patches.get(e.id);
          return p ? { ...e, ...p } : e;
        }));
      }
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
    // Wipe the persisted snapshot so the resume prompt doesn't pop back up.
    try { localStorage.removeItem(IMPORT_STATE_KEY); } catch {}
  }

  async function saveAllToSupabase() {
    const doneEntries = entries.filter(e => e.status === 'done' && (e.jobs?.length ?? 0) > 0);
    if (doneEntries.length === 0) return;

    setSaving(true);
    setSaveResult(null);

    // Flatten — no pre-save dedup. The DB unique index on apply_url was
    // dropped in migration_v5 at user request, so every fetched row is
    // inserted as-is, even if the same apply_url already exists.
    const allJobs = doneEntries.flatMap(e => e.jobs ?? []);

    try {
      // Batch into SAVE_BATCH_SIZE chunks, then run SAVE_CONCURRENCY chunks
      // in parallel. For a 50k-job scrape this drops save time from minutes
      // to ~30s while keeping the per-call payload below /api/ats/save's
      // 1000-jobs-per-batch hard limit.
      const batches: typeof allJobs[] = [];
      for (let i = 0; i < allJobs.length; i += SAVE_BATCH_SIZE) {
        batches.push(allJobs.slice(i, i + SAVE_BATCH_SIZE));
      }
      let totalInserted = 0;
      let totalSkipped  = 0;
      let firstError: string | null = null;
      // Capture the first per-batch DB error message so a partial-success
      // run can still surface what went wrong on the dead rows. Before
      // this, a 70% insert / 30% trigger-bug run would show "X saved · Y
      // skipped" looking like dedup and hide the real defect.
      let firstPartial: string | null = null;
      let cursor = 0;
      async function worker() {
        while (true) {
          const idx = cursor++;
          if (idx >= batches.length || firstError) return;
          const batch = batches[idx];
          try {
            const res = await fetch('/api/ats/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobs: batch }),
            });
            const data = await res.json();
            if (!res.ok) { firstError = data.error ?? 'Failed to save jobs'; return; }
            totalInserted += data.inserted ?? 0;
            totalSkipped  += data.skipped  ?? 0;
            if (!firstPartial && data.partial_error) firstPartial = data.partial_error;
          } catch (err: any) {
            firstError = err.message ?? 'Network error';
          }
        }
      }
      await Promise.all(Array.from({ length: SAVE_CONCURRENCY }, () => worker()));
      if (firstError) {
        alert(firstError);
        setSaving(false);
        return;
      }
      // Partial-failure path: show the DB error message so the admin
      // doesn't silently lose rows thinking they were just dedup'd.
      if (firstPartial && totalSkipped > 0) {
        alert(`Imported ${totalInserted}, ${totalSkipped} failed at DB. First error: ${firstPartial}`);
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

  // Single-pass aggregation — the old version did 26 separate .filter() walks
  // over `entries` plus three more for filtered/stats/progress. At 10k rows
  // that ran on every keystroke. Now it's one walk per entries change.
  const stats = useMemo(() => {
    let total = 0, detected = 0, done = 0, errors = 0, finished = 0, jobs = 0;
    const byPlatform: Record<string, number> = {
      greenhouse: 0, lever: 0, ashby: 0, workable: 0, recruitee: 0, workday: 0,
      smartrecruiters: 0, personio: 0, bamboohr: 0, jazzhr: 0, breezy: 0,
      comeet: 0, jobvite: 0, icims: 0, recruiterbox: 0, jobscore: 0,
      zohorecruit: 0, teamtailor: 0, manatal: 0, pinpoint: 0, jobadder: 0,
      talentlyft: 0, heyrecruit: 0, vivahr: 0, polymer: 0, taleo: 0,
      successfactors: 0,
      // "25 more" batch
      bullhorn: 0, crelate: 0, newton: 0, cornerstone: 0, ukgpro: 0, adp: 0,
      paylocity: 0, loxo: 0, vincere: 0, avature: 0, eightfold: 0, phenom: 0,
      beamery: 0, hireology: 0, clearcompany: 0, hrpartner: 0, recooty: 0,
      skeeled: 0, hibob: 0, pcrecruiter: 0, catsone: 0, recruitcrm: 0,
      sagepeople: 0, workzoom: 0, hireserve: 0,
      unknown: 0,
    };
    for (const e of entries) {
      total++;
      jobs += e.jobCount;
      if (e.platform !== 'unknown')                     detected++;
      if (e.status === 'done')                          done++;
      if (e.status === 'error')                         errors++;
      if (e.status === 'done' || e.status === 'error' || e.status === 'skipped') finished++;
      byPlatform[e.platform] = (byPlatform[e.platform] ?? 0) + 1;
    }
    return { total, detected, done, errors, finished, jobs, byPlatform };
  }, [entries]);

  const progress = stats.total > 0 ? Math.round((stats.finished / stats.total) * 100) : 0;

  const filtered = useMemo(() => {
    const needle = searchQ.trim().toLowerCase();
    return entries.filter(e => {
      if (filterPlatform !== 'all' && e.platform !== filterPlatform) return false;
      if (filterStatus   !== 'all' && e.status   !== filterStatus)   return false;
      if (needle && !e.url.toLowerCase().includes(needle) && !(e.name ?? '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [entries, searchQ, filterPlatform, filterStatus]);

  // Cap how many rows we actually render — DOM with 10k rows is unusably
  // janky even with virtualization libs. Filters + search are the way to
  // drill in past the cap.
  const visible = useMemo(() => filtered.slice(0, MAX_RENDERED_ROWS), [filtered]);
  const truncated = filtered.length > visible.length;

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
            Paste up to {URL_LIMIT.toLocaleString()} career page URLs — auto-detects 52 ATS platforms and pulls all jobs in parallel.
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

      {/* Resume prompt — appears when a previous session was interrupted
          (browser closed mid-scrape, refreshed during fetch, etc). */}
      {resumePrompt && entries.length === 0 && (
        <div className="card p-4 mb-4 flex items-center gap-3 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-900/10 flex-wrap">
          <CloudUpload className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400 flex-1 min-w-0">
            Found an unfinished import — <span className="font-bold">{resumePrompt.count.toLocaleString()} URLs</span> were still in progress.
          </p>
          <button onClick={resumeFromSnapshot}
            className="px-3 py-1.5 bg-brand-700 dark:bg-brand-500 text-white text-xs font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Resume
          </button>
          <button onClick={discardSnapshot}
            className="px-3 py-1.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-500 text-xs font-semibold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            Discard
          </button>
        </div>
      )}

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
            placeholder={`Paste any mix of career page URLs, one per line:\n\nhttps://boards.greenhouse.io/stripe\nhttps://jobs.lever.co/netflix\nhttps://jobs.ashbyhq.com/cohere\nhttps://apply.workable.com/algolia\nhttps://www.anthropic.com/careers\nhttps://linear.app/careers\n...(up to ${URL_LIMIT.toLocaleString()} at a time)`}
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
                { platform: 'workday',         pattern: '{tenant}.wd{n}.myworkdayjobs.com/{site}', example: 'nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite', count: '10,000+ companies' },
                { platform: 'smartrecruiters', pattern: 'careers.smartrecruiters.com/{company}',  example: 'careers.smartrecruiters.com/Bosch',                          count: '4,000+ companies' },
                { platform: 'personio',        pattern: '{company}.jobs.personio.de',             example: 'mistral.jobs.personio.de',                                  count: '8,000+ companies (EU)' },
                { platform: 'bamboohr',        pattern: '{company}.bamboohr.com/careers',         example: 'klue.bamboohr.com/careers',                                 count: '30,000+ companies' },
                { platform: 'jazzhr',          pattern: '{company}.applytojob.com',               example: 'acme.applytojob.com',                                       count: '6,000+ companies' },
                { platform: 'breezy',          pattern: '{company}.breezy.hr',                    example: 'acme.breezy.hr',                                            count: '10,000+ companies' },
                { platform: 'comeet',          pattern: 'comeet.com/jobs/{co}/{id}',              example: 'comeet.com/jobs/honeybook/14.00C',                          count: '~1,500 companies' },
                { platform: 'jobvite',         pattern: 'jobs.jobvite.com/careers/{company}',     example: 'jobs.jobvite.com/careers/zillow',                           count: '2,000+ companies' },
                { platform: 'icims',           pattern: 'careers-{company}.icims.com',            example: 'careers-yelp.icims.com',                                    count: '4,000+ companies' },
                { platform: 'recruiterbox',    pattern: '{company}.recruiterbox.com',             example: 'acme.recruiterbox.com',                                     count: '~3,000 companies' },
                { platform: 'jobscore',        pattern: 'careers.jobscore.com/careers/{co}',      example: 'careers.jobscore.com/careers/segment',                      count: '~1,000 companies' },
                { platform: 'zohorecruit',     pattern: '{company}.zohorecruit.com',              example: 'acme.zohorecruit.com',                                      count: '~5,000 companies' },
                { platform: 'teamtailor',      pattern: '{company}.teamtailor.com',               example: 'spotify.teamtailor.com',                                    count: '8,000+ companies' },
                { platform: 'manatal',         pattern: '{company}.manatal.com',                  example: 'acme.manatal.com',                                          count: '~2,000 companies' },
                { platform: 'pinpoint',        pattern: '{company}.pinpointhq.com',               example: 'acme.pinpointhq.com',                                       count: '~500 companies' },
                { platform: 'jobadder',        pattern: '{company}.jobadder.com',                 example: 'acme.jobadder.com',                                         count: '~5,000 companies' },
                { platform: 'talentlyft',      pattern: '{company}.talentlyft.com',               example: 'acme.talentlyft.com',                                       count: '~1,000 companies' },
                { platform: 'heyrecruit',      pattern: '{company}.heyrecruit.com',               example: 'acme.heyrecruit.com',                                       count: '~300 companies' },
                { platform: 'vivahr',          pattern: '{company}.vivahr.com',                   example: 'acme.vivahr.com',                                           count: '~1,500 companies' },
                { platform: 'polymer',         pattern: 'polymer.co/{company}',                   example: 'polymer.co/acme',                                           count: '~200 companies' },
                { platform: 'taleo',           pattern: '{co}.taleo.net/careersection/{site}',    example: 'oracle.taleo.net/careersection/2',                          count: 'Enterprise (Oracle)' },
                { platform: 'successfactors',  pattern: 'career{n}.successfactors.eu/career?company={co}', example: 'career4.successfactors.eu/career?company=acme',     count: 'Enterprise (SAP)' },
                // ── "25 more" batch ──────────────────────────────────────
                { platform: 'bullhorn',        pattern: '{agency}.bullhornstaffing.com',          example: 'acme.bullhornstaffing.com',                                 count: '~5,000 agencies' },
                { platform: 'crelate',         pattern: 'app.crelate.com/p/{slug}',               example: 'app.crelate.com/p/acme',                                    count: '~3,000 companies' },
                { platform: 'newton',          pattern: '{co}.iapplicants.com',                   example: 'acme.iapplicants.com',                                      count: '~2,000 companies' },
                { platform: 'cornerstone',     pattern: 'careers-{co}.csod.com',                  example: 'careers-acme.csod.com',                                     count: 'Enterprise (CSOD)' },
                { platform: 'ukgpro',          pattern: 'recruiting.ultipro.com/{co}',            example: 'recruiting.ultipro.com/ACM1001',                            count: 'Enterprise (UKG)' },
                { platform: 'adp',             pattern: 'workforcenow.adp.com/jobs/apply/...',    example: 'workforcenow.adp.com/jobs/apply/posting.html?cid=…',        count: 'Enterprise (ADP)' },
                { platform: 'paylocity',       pattern: 'recruiting.paylocity.com/recruiting/jobs/All/{uuid}/{co}', example: 'recruiting.paylocity.com/recruiting/jobs/All/abc-…/acme', count: 'Enterprise' },
                { platform: 'loxo',            pattern: '{agency}.loxo.co',                       example: 'acme.loxo.co',                                              count: 'Executive search' },
                { platform: 'vincere',         pattern: '{co}.vincere.io',                        example: 'acme.vincere.io',                                           count: '~1,500 agencies' },
                { platform: 'avature',         pattern: '{co}.avature.net',                       example: 'acme.avature.net',                                          count: 'Enterprise' },
                { platform: 'eightfold',       pattern: '{co}.eightfold.ai',                      example: 'acme.eightfold.ai',                                         count: 'AI-powered' },
                { platform: 'phenom',          pattern: '{co}.phenompeople.com',                  example: 'acme.phenompeople.com',                                     count: 'Enterprise' },
                { platform: 'beamery',         pattern: '{co}.beamery.com',                       example: 'acme.beamery.com',                                          count: 'Enterprise' },
                { platform: 'hireology',       pattern: '{co}.hireology.com',                     example: 'acme.hireology.com',                                        count: '~3,000 companies' },
                { platform: 'clearcompany',    pattern: 'careers.clearcompany.com/{co}',          example: 'careers.clearcompany.com/acme',                             count: '~2,000 companies' },
                { platform: 'hrpartner',       pattern: '{co}.hrpartner.io',                      example: 'acme.hrpartner.io',                                         count: '~500 companies' },
                { platform: 'recooty',         pattern: '{co}.recooty.com',                       example: 'acme.recooty.com',                                          count: '~1,000 companies' },
                { platform: 'skeeled',         pattern: 'careers.skeeled.com/{co}',               example: 'careers.skeeled.com/acme',                                  count: '~500 companies' },
                { platform: 'hibob',           pattern: 'apply.hibob.com/{slug}',                 example: 'apply.hibob.com/acme',                                      count: '~2,000 companies' },
                { platform: 'pcrecruiter',     pattern: '{co}.pcrjobs.com',                       example: 'acme.pcrjobs.com',                                          count: '~1,500 agencies' },
                { platform: 'catsone',         pattern: '{co}.catsone.com',                       example: 'acme.catsone.com',                                          count: '~1,000 companies' },
                { platform: 'recruitcrm',      pattern: '{co}.recruitcrm.io',                     example: 'acme.recruitcrm.io',                                        count: '~2,000 agencies' },
                { platform: 'sagepeople',      pattern: '{co}.peoplexchange.com',                 example: 'acme.peoplexchange.com',                                    count: 'Enterprise (Sage)' },
                { platform: 'workzoom',        pattern: '{co}.workzoom.com',                      example: 'acme.workzoom.com',                                         count: 'Small business (CA)' },
                { platform: 'hireserve',       pattern: '{co}.hireserve.com',                     example: 'acme.hireserve.com',                                        count: '~500 companies (UK)' },
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
                {/* "skipped" now means insert errored (DB constraint, bad
                    payload). Duplicates no longer skip after migration_v5. */}
                {saveResult.skipped > 0 && (
                  <span className="text-stone-400 dark:text-stone-500">· {saveResult.skipped} failed</span>
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

          <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
            {truncated
              ? <>Showing first <span className="font-bold">{visible.length.toLocaleString()}</span> of {filtered.length.toLocaleString()} matches — refine the search/filter to drill in (total in session: {entries.length.toLocaleString()}).</>
              : <>{filtered.length.toLocaleString()} of {entries.length.toLocaleString()} entries</>
            }
          </p>

          {/* Entry list */}
          <div className="space-y-2">
            {visible.map(entry => {
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
