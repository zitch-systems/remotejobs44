// lib/ingest-pipeline.ts
// Pulls remote jobs from every active source in the in-code SOURCES list
// (Remotive, Jobicy, RemoteOK, Arbeitnow, WorkingNomads, Himalayas, Findwork
// (if key), SerpApi (if key)) and upserts them into public.jobs, deduped on
// apply_url (migration_v25 restored the unique index). A posting we already
// have is left untouched (ON CONFLICT DO NOTHING) instead of re-inserted, so
// the daily cron no longer multiplies rows — but we bump its last_seen_at
// (migration_v27) so a still-listed job keeps a fresh "seen" timestamp.
// The daily cron's staleness pass deactivates jobs not seen in any feed
// for 60 days, so the public listings stay current.
//
// JobSpy (LinkedIn/Indeed/ZipRecruiter/Google via a self-hosted JobSpy API)
// is NOT in SOURCES — it's a slow scraper that used to get starved at the
// tail of the shared 60s daily-cron budget. It runs in its own daily cron via
// runJobSpyIngest() below, which additionally drops any posting already on the
// platform from another source (cross-source identity dedup) before insert.
//
// Called by:
//   * /api/cron/daily       — scheduled cron, the single daily 6am UTC run
//   * /api/cron/ingest      — manual debug re-trigger (same auth secret)
//   * /api/admin/ingest-now — admin "run now" button (runs JobSpy too)
//   * /api/cron/jobspy      — scheduled JobSpy scrape (runJobSpyIngest)
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { detectScam } from '@/lib/scam-detect';
import { parseFeed, feedJobToDbRow } from '@/lib/feed-parser';
import { looksLikeHtml, tryDiscoveredFeeds } from '@/lib/feed-discovery';
import { enrichDirectApplyLinks } from '@/lib/apply-link';
import { validateExternalUrlAndResolve } from '@/lib/ssrf-guard';
import { dedupeByApplyUrl, jobIdentityKey, filterByIdentity } from '@/lib/dedupe-jobs';
import { touchLastSeen, batchByLength } from '@/lib/jobs-last-seen';
import {
  isJobSpyConfigured, fetchJobSpyJobs, jobSpyJobToDbRow,
  jobSpySourceUrl, JOBSPY_DEFAULT_QUERIES, JobSpyHttpError,
} from '@/lib/jobspy';
import { logInfo, logWarn, logError } from '@/lib/log';

const FINDWORK_KEY = process.env.FINDWORK_API_KEY ?? '';
const SERP_KEY     = process.env.SERPAPI_KEY ?? '';

// Per-source cap. Each feed exposes its newest postings; we take up to this
// many so a still-listed job keeps getting its last_seen_at refreshed and we
// ingest more than the old hard-coded 50. RemoteOK / WorkingNomads return
// their whole board, so for them this is the real limiter.
const MAX_JOBS_PER_SOURCE = 200;

// Soft time budget for the user-added-sources loop. The cron route runs
// with maxDuration 60s and ingest shares it with other daily tasks; when
// the budget is gone we record the remaining sources as skipped instead
// of letting the platform kill the function mid-pipeline (which would
// leave sources unmarked and the lock held until TTL).
const USER_SOURCES_BUDGET_MS = 45_000;

// Wall-clock cap for the hardcoded SOURCES loop. Each source can burn ~40s in
// the worst case (getJson's 20s timeout × 2 attempts + backoff), so a couple of
// hanging upstreams could otherwise run this loop past the function's 60s
// maxDuration and get the whole pipeline killed mid-run — leaving the cron lock
// held until its TTL and the daily route's downstream tasks (expiry, freshness,
// alerts) unrun. On a healthy run every source answers in 1–3s and the loop
// finishes well under this, so no legitimate source is ever skipped; the cap
// only bites when feeds hang. Skipped sources run first next cycle.
const HARDCODED_SOURCES_BUDGET_MS = 40_000;

// Feed bodies larger than this aren't feeds. Mirrors /api/rss's cap.
const MAX_FEED_BYTES = 5 * 1024 * 1024;

// WP Job Manager boards: how many new board detail pages we'll fetch per
// source per run to pull the employer's direct apply link. Items beyond
// the cap are deferred to the next run (they stay "new" until enriched),
// so a backlog drains over a few days and every stored job ends up with
// a direct link rather than a permanent board link.
const WPJM_ENRICH_MAX = 10;

// The search_vector GIN trigger on jobs can't take large INSERT batches
// reliably (same limit as /api/ats/save and ats-refresh).
const JOBS_INSERT_CHUNK = 25;

// Shared fetch helper — throws on non-2xx so we don't try to .json() a 404 HTML
// page or 500 error body. The per-source try/catch in runIngest catches the
// throw and isolates the failure to that one source.
//
// Two resiliency touches for the free feeds: (1) send a browser-ish
// User-Agent by default — RemoteOK / Jobicy and friends reject the bare
// Node/undici UA — and (2) retry once on any transient failure (network blip,
// 429/5xx, timeout) with a short backoff. We set a fresh AbortSignal per
// attempt (overriding any caller-supplied one) so a first-attempt timeout
// doesn't instantly fail the retry with an already-aborted signal.
async function getJson(url: string, init?: RequestInit): Promise<any> {
  const headers = new Headers(init?.headers);
  if (!headers.has('user-agent')) {
    headers.set('User-Agent', 'Mozilla/5.0 (compatible; RemoteJobs44/1.0; +https://remotejobs44.com)');
  }
  if (!headers.has('accept')) headers.set('Accept', 'application/json, */*');

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(res => setTimeout(res, 600 * attempt));
    try {
      const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} ${url}`);
      return await r.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Defensive array accessor — any free public API can suddenly return a wrapper
// instead of an array. Use this everywhere we expect a list.
function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

type RawJob = Record<string, any>;
export interface Source {
  name: string;
  sourceUrl: string;
  fetch: () => Promise<RawJob[]>;
  normalise: (j: RawJob) => Record<string, any> | null;
}

const SOURCES: Source[] = [
  {
    name: 'Remotive',
    sourceUrl: 'https://remotive.com/api/remote-jobs',
    fetch: async () => {
      const d = await getJson('https://remotive.com/api/remote-jobs?limit=200', { signal: AbortSignal.timeout(15000) });
      return asArray(d.jobs);
    },
    normalise: (j) => ({
      title: j.title ?? 'Untitled', company: j.company_name ?? 'Unknown',
      logo: firstChar(j.company_name),
      category: mapCat(j.category ?? j.title ?? ''), type: 'full-time',
      level: mapLevel(j.title ?? ''), location: j.candidate_required_location ?? 'Worldwide',
      description: (j.description ?? '').slice(0, 5000),
      salary_min: j.salary_min ?? null, salary_max: j.salary_max ?? null, currency: j.salary_currency ?? 'USD',
      apply_url: j.url ?? null, posted_at: j.publication_date ?? new Date().toISOString(),
      source: 'remotive', source_url: 'https://remotive.com/api/remote-jobs',
      remote: true, featured: false, is_new: true, is_active: true,
    }),
  },
  {
    name: 'Jobicy',
    sourceUrl: 'https://jobicy.com/api/v2/remote-jobs',
    fetch: async () => {
      const d = await getJson('https://jobicy.com/api/v2/remote-jobs?count=50', { signal: AbortSignal.timeout(15000) });
      return asArray(d.jobs);
    },
    normalise: (j) => ({
      title: j.jobTitle ?? j.title ?? 'Untitled', company: j.companyName ?? j.company ?? 'Unknown',
      logo: firstChar(j.companyName ?? j.company),
      category: mapCat(j.jobIndustry ?? j.title ?? ''), type: mapType(j.jobType ?? ''),
      level: mapLevel(j.jobTitle ?? j.title ?? ''), location: j.jobGeo ?? 'Worldwide',
      description: (j.jobExcerpt ?? j.jobDescription ?? '').slice(0, 5000),
      salary_min: null, salary_max: null, currency: 'USD',
      apply_url: j.url ?? null, posted_at: j.pubDate ?? new Date().toISOString(),
      source: 'jobicy', source_url: 'https://jobicy.com/api/v2/remote-jobs',
      remote: true, featured: false, is_new: true, is_active: true,
    }),
  },
  {
    name: 'RemoteOK',
    sourceUrl: 'https://remoteok.com/api',
    fetch: async () => {
      const d = await getJson('https://remoteok.com/api', {
        headers: { 'User-Agent': 'RemoteJobs44/1.0 (hello@remotejobs44.com)' },
        signal: AbortSignal.timeout(15000),
      });
      // RemoteOK's first element is a legal disclaimer object, not a job.
      return Array.isArray(d) ? d.slice(1) : [];
    },
    normalise: (j) => ({
      title: j.position ?? j.title ?? 'Untitled', company: j.company ?? 'Unknown',
      logo: firstChar(j.company),
      category: mapCat(Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags ?? '')),
      type: 'full-time', level: mapLevel(j.position ?? j.title ?? ''),
      location: j.location ?? 'Worldwide',
      description: (j.description ?? '').slice(0, 5000),
      salary_min: j.salary_min ?? null, salary_max: j.salary_max ?? null, currency: 'USD',
      apply_url: j.apply_url ?? j.url ?? (j.slug ? `https://remoteok.com/remote-jobs/${j.slug}` : null),
      posted_at: j.date ?? new Date().toISOString(),
      source: 'remoteok', source_url: 'https://remoteok.com/api',
      remote: true, featured: false, is_new: true, is_active: true,
    }),
  },
  {
    name: 'Arbeitnow',
    sourceUrl: 'https://www.arbeitnow.com/api/job-board-api',
    fetch: async () => {
      const d = await getJson('https://www.arbeitnow.com/api/job-board-api', { signal: AbortSignal.timeout(15000) });
      return asArray(d.data);
    },
    normalise: (j) => ({
      title: j.title ?? 'Untitled', company: j.company_name ?? 'Unknown',
      logo: firstChar(j.company_name),
      category: mapCat(Array.isArray(j.tags) ? j.tags.join(' ') : (j.title ?? '')),
      type: j.job_types?.[0] ? mapType(j.job_types[0]) : 'full-time',
      level: mapLevel(j.title ?? ''), location: j.location ?? (j.remote ? 'Worldwide' : 'On-site'),
      description: (j.description ?? '').slice(0, 5000),
      salary_min: null, salary_max: null, currency: 'EUR',
      apply_url: j.url ?? null,
      posted_at: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
      source: 'arbeitnow', source_url: 'https://www.arbeitnow.com/api/job-board-api',
      remote: j.remote ?? false, featured: false, is_new: true, is_active: true,
    }),
  },
  {
    name: 'WorkingNomads',
    sourceUrl: 'https://www.workingnomads.com/api/exposed_jobs/',
    fetch: async () => {
      const d = await getJson('https://www.workingnomads.com/api/exposed_jobs/', {
        headers: { 'User-Agent': 'RemoteJobs44/1.0 (hello@remotejobs44.com)' },
        signal: AbortSignal.timeout(15000),
      });
      return asArray(d);
    },
    normalise: (j) => ({
      title: j.title ?? 'Untitled', company: j.company_name ?? 'Unknown',
      logo: firstChar(j.company_name),
      category: mapCat(j.category_name ?? j.tags ?? j.title ?? ''),
      type: 'full-time', level: mapLevel(j.title ?? ''),
      location: j.location ?? 'Worldwide',
      description: (j.description ?? '').slice(0, 5000),
      salary_min: null, salary_max: null, currency: 'USD',
      apply_url: j.url ?? null,
      posted_at: j.pub_date ?? j.publication_date ?? new Date().toISOString(),
      source: 'workingnomads', source_url: 'https://www.workingnomads.com/api/exposed_jobs/',
      remote: true, featured: false, is_new: true, is_active: true,
    }),
  },
  {
    name: 'Himalayas',
    sourceUrl: 'https://himalayas.app/jobs/api',
    fetch: async () => {
      const d = await getJson('https://himalayas.app/jobs/api?limit=100', {
        headers: { 'User-Agent': 'RemoteJobs44/1.0 (hello@remotejobs44.com)' },
        signal: AbortSignal.timeout(15000),
      });
      return asArray(d.jobs ?? d.data);
    },
    normalise: (j) => ({
      title: j.title ?? j.jobTitle ?? 'Untitled',
      company: j.companyName ?? j.company ?? 'Unknown',
      logo: firstChar(j.companyName ?? j.company),
      category: mapCat(Array.isArray(j.categories) ? j.categories.join(' ') : (j.title ?? '')),
      type: mapType(j.employmentType ?? 'full-time'),
      level: mapLevel(j.title ?? ''),
      location: j.locationRestrictions?.[0] ?? j.location ?? 'Worldwide',
      description: (j.excerpt ?? j.description ?? '').slice(0, 5000),
      salary_min: j.minBaseSalary ?? null,
      salary_max: j.maxBaseSalary ?? null,
      currency: j.currency ?? 'USD',
      apply_url: j.applicationLink ?? j.url ?? null,
      posted_at: toIso(j.pubDate ?? j.publishDate),
      source: 'himalayas', source_url: 'https://himalayas.app/jobs/api',
      remote: true, featured: false, is_new: true, is_active: true,
    }),
  },
  ...(FINDWORK_KEY ? [{
    name: 'Findwork',
    sourceUrl: 'https://findwork.dev/api/jobs/',
    fetch: async (): Promise<RawJob[]> => {
      const d = await getJson('https://findwork.dev/api/jobs/?sort_by=date', {
        headers: { Authorization: `Token ${FINDWORK_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      return asArray(d.results);
    },
    normalise: (j: RawJob) => ({
      title: j.role ?? j.title ?? 'Untitled', company: j.company_name ?? 'Unknown',
      logo: firstChar(j.company_name),
      category: mapCat(Array.isArray(j.keywords) ? j.keywords.join(' ') : (j.role ?? '')),
      type: 'full-time', level: mapLevel(j.role ?? ''),
      location: j.location ?? (j.remote ? 'Worldwide' : 'On-site'),
      description: (j.text ?? '').slice(0, 5000),
      salary_min: null, salary_max: null, currency: 'USD',
      apply_url: j.url ?? j.apply_url ?? null,
      posted_at: j.date_posted ?? new Date().toISOString(),
      source: 'findwork', source_url: 'https://findwork.dev/api/jobs/',
      remote: j.remote ?? false, featured: false, is_new: true, is_active: true,
    }),
  } as Source] : []),
  ...(SERP_KEY ? ['remote software engineer', 'remote designer', 'remote marketing', 'remote product manager'].map(query => ({
    name: `SerpApi:${query.replace('remote ', '')}`,
    sourceUrl: `https://serpapi.com/search.json?q=${encodeURIComponent(query)}`,
    fetch: async (): Promise<RawJob[]> => {
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google_jobs');
      url.searchParams.set('q', query);
      url.searchParams.set('ltype', '1');
      url.searchParams.set('num', '10');
      url.searchParams.set('api_key', SERP_KEY);
      const d = await getJson(url.toString(), { signal: AbortSignal.timeout(20000) });
      return asArray(d.jobs_results);
    },
    normalise: (j: RawJob): Record<string, any> | null => {
      const applyUrl = j.apply_options?.[0]?.link ?? j.related_links?.[0]?.link ?? null;
      if (!applyUrl) return null;
      let salaryMin: number | null = null;
      let salaryMax: number | null = null;
      const salaryRaw: string = j.detected_extensions?.salary ?? '';
      if (salaryRaw) {
        const nums = salaryRaw.replace(/[^0-9.]/g, ' ').trim().split(/\s+/).map(Number).filter(n => n > 0);
        if (nums.length >= 2) { salaryMin = nums[0]; salaryMax = nums[1]; }
        else if (nums.length === 1) { salaryMin = nums[0]; }
      }
      return {
        title: j.title ?? 'Untitled', company: j.company_name ?? 'Unknown',
        logo: firstChar(j.company_name),
        category: mapCat(j.title ?? ''), type: mapType(j.detected_extensions?.schedule_type ?? ''),
        level: mapLevel(j.title ?? ''), location: j.location ?? 'Worldwide',
        description: (j.description ?? '').slice(0, 5000),
        salary_min: salaryMin, salary_max: salaryMax, currency: 'USD',
        apply_url: applyUrl,
        posted_at: j.detected_extensions?.posted_at ? parseSerpDate(j.detected_extensions.posted_at) : new Date().toISOString(),
        source: 'serpapi', source_url: 'https://serpapi.com',
        remote: true, featured: false, is_new: true, is_active: true,
      };
    },
  } as Source)) : []),
];

export interface IngestResult {
  success:    boolean;
  totalAdded: number;
  results:    Record<string, number | string>;
  paused:     string[];
  at:         string;
  /** True when another runner held the lock and this call short-circuited. */
  skipped?:   boolean;
  reason?:    string;
}

// Lock TTL: the longest the ingest could plausibly take. If a runner
// crashes mid-pipeline, the lock auto-expires after this many seconds
// so the next scheduled run isn't permanently blocked.
const INGEST_LOCK_NAME = 'ingest';
const INGEST_LOCK_TTL_SECONDS = 10 * 60;

export async function runIngest(): Promise<IngestResult> {
  const ingestStartedAt = Date.now();
  const supabase = createAdminSupabaseClient();
  const results: Record<string, number | string> = {};
  let totalAdded = 0;

  // Concurrency lock: only one runIngest may be in flight at a time.
  // The lock TTL above provides a self-heal in case a runner crashes;
  // the release at the end of this function is the happy-path cleanup.
  // (migration_v14 adds the cron_locks table + try_acquire_cron_lock fn.)
  try {
    const { data: acquired, error: lockErr } = await supabase.rpc('try_acquire_cron_lock', {
      lock_name:    INGEST_LOCK_NAME,
      ttl_seconds:  INGEST_LOCK_TTL_SECONDS,
    });
    if (lockErr) {
      // Function missing (migration not applied yet) — log and continue
      // rather than block ingest entirely. Logged so it's noisy in ops.
      logWarn({ event: 'ingest.lock_rpc_unavailable', error: lockErr.message });
    } else if (acquired === false) {
      logInfo({ event: 'ingest.skipped', reason: 'lock_held' });
      return {
        success:    true,
        totalAdded: 0,
        results:    {},
        paused:     [],
        at:         new Date().toISOString(),
        skipped:    true,
        reason:     'Another ingest is already running. Try again in a few minutes.',
      };
    }
  } catch (err: any) {
    logWarn({ event: 'ingest.lock_acquire_threw', error: err.message });
  }

  // From here on, we hold the lock (or the lock layer was unavailable).
  // Wrap the rest in try/finally so the lock always releases.
  try {

  // Read paused sources from job_sources. Admin can pause a misbehaving
  // source (e.g. ATS upstream that's been returning spam) by setting
  // its row's `status = 'paused'`. URL match is canonical because a
  // single source may have multiple aliases in the in-code SOURCES list.
  let pausedUrls = new Set<string>();
  try {
    const { data: paused } = await supabase
      .from('job_sources')
      .select('url')
      .eq('status', 'paused');
    pausedUrls = new Set((paused ?? []).map((r: { url: string }) => r.url));
  } catch (err: any) {
    // Don't block the run if job_sources is unreadable for any reason.
    logWarn({ event: 'ingest.paused_sources_read_failed', error: err.message });
  }
  const pausedNames: string[] = [];

  for (const source of SOURCES) {
    if (pausedUrls.has(source.sourceUrl)) {
      pausedNames.push(source.name);
      results[source.name] = 'paused';
      continue;
    }
    // Out of time budget (a hanging upstream ate the window): skip the rest so
    // the function isn't killed mid-pipeline. They run first next cycle.
    if (Date.now() - ingestStartedAt > HARDCODED_SOURCES_BUDGET_MS) {
      results[source.name] = 'skipped: ingest time budget exhausted, runs next cycle';
      continue;
    }
    try {
      const raw = await source.fetch();
      const jobs = raw.slice(0, MAX_JOBS_PER_SOURCE)
        .map(source.normalise)
        .filter((j): j is Record<string, any> => !!j && !!j.apply_url)
        .map((j): Record<string, any> => {
          // First-pass scam screen — flag suspicious rows in place so an
          // admin can sweep them at /admin/jobs. We don't drop the row;
          // public listing queries filter `.eq('flagged', false)`. Letting
          // legit jobs slip through with a flag is recoverable; letting
          // scams reach paying users isn't.
          const scam = detectScam(j);
          if (scam) {
            return { ...j, flagged: true, flagged_reason: scam.flagged_reason };
          }
          // Explicit false/null so every row in the batch carries the same
          // keys. supabase-js builds the insert column list from the union
          // of keys across the batch and PostgREST NULL-fills the gaps —
          // an explicit NULL overrides flagged's DEFAULT and violates its
          // NOT NULL whenever a batch mixes flagged and unflagged rows
          // (the failure that zeroed Remotive/RemoteOK/WorkingNomads runs).
          return { ...j, flagged: false, flagged_reason: null };
        });

      if (!jobs.length) {
        results[source.name] = 0;
        await recordSourceRun(supabase, source, 0, 'ok');
        continue;
      }

      // Dedup on apply_url: collapse repeats inside this batch, then
      // upsert with ON CONFLICT DO NOTHING (migration_v25's unique index
      // backs this) so a posting we already have is skipped instead of
      // re-inserted. The chunked helper returns only genuinely new rows
      // in its count, and isolates bad rows instead of zeroing the run.
      const deduped = dedupeByApplyUrl(jobs);
      const up = await upsertJobsChunked(supabase, deduped);

      if (up.inserted === 0 && up.failed > 0) {
        results[source.name] = `db error: ${up.firstError ?? 'insert failed'}`;
        await recordSourceRun(supabase, source, 0, 'error', up.firstError);
      } else {
        results[source.name] = up.failed > 0
          ? `${up.inserted} (${up.failed} rows failed: ${up.firstError})`
          : up.inserted;
        totalAdded += up.inserted;
        // Mark every posting in this batch as seen now so a still-listed
        // job keeps a fresh last_seen_at and never ages out of the 60-day
        // staleness sweep. New rows get last_seen_at from the column
        // default; this covers the ones ON CONFLICT DO NOTHING skipped. We
        // deliberately don't flip is_active, so an admin soft-delete
        // (companies/remove) isn't undone.
        await touchLastSeen(supabase, deduped.map(r => r.apply_url), source.name);
        await recordSourceRun(supabase, source, up.inserted, 'ok');
      }
    } catch (err: any) {
      logError({ event: 'ingest.source_failed', source: source.name, error: err.message });
      results[source.name] = `error: ${err.message}`;
      await recordSourceRun(supabase, source, 0, 'error', err.message);
    }
  }

  // ── User-added sources from job_sources ──────────────────────────
  // Anything in job_sources whose URL isn't already covered by one of
  // the in-code SOURCES adapters above is a custom feed an admin added
  // via the /admin/sources UI. We fetch each, run the generic
  // RSS/JSON parser, and insert the returned jobs. The same scam screen
  // applies, and SSRF is re-validated on every fetch (the URL was
  // checked at POST time, but column values can be edited via the DB
  // directly).
  const hardcodedUrls = new Set(SOURCES.map(s => s.sourceUrl));
  try {
    // 'error' rows are included deliberately. markSourceStatus() writes
    // status='error' on ANY failure — a 502 from the origin, a DNS blip, a
    // timeout — so selecting only status='active' meant a single transient
    // failure removed a source from every subsequent run, permanently, with
    // nothing in the pipeline to ever retry it. Only an explicit
    // status='paused' — an admin decision — keeps a source out of the run.
    const { data: customRows } = await supabase
      .from('job_sources')
      .select('id, name, url, method')
      .in('status', ['active', 'error'])
      // Least-recently-attempted first. markSourceStatus() stamps last_sync_at
      // on failures too, so a source that keeps erroring rotates to the back
      // instead of eating the front of the budget every run and starving the
      // healthy ones behind it.
      .order('last_sync_at', { ascending: true, nullsFirst: true });
    const customSources = (customRows ?? []).filter(r => !hardcodedUrls.has(r.url));
    // Budget counts from the start of the whole ingest (the hardcoded
    // loop eats into it), with a small floor so user sources always get
    // some window even after a slow hardcoded run.
    const userLoopDeadline = Math.max(
      ingestStartedAt + USER_SOURCES_BUDGET_MS,
      Date.now() + 10_000,
    );

    for (const row of customSources) {
      const label = row.name || row.url;
      // Out of budget: record the skip and leave the source's stored
      // status alone — it runs first thing next cycle.
      if (Date.now() > userLoopDeadline) {
        results[label] = 'skipped: ingest time budget exhausted, runs next cycle';
        continue;
      }
      // Re-validate URL on every run. A row may have been inserted via
      // SQL (bypassing the API's SSRF guard) so we can't assume it's safe.
      // DNS-aware: also rejects public hostnames that resolve to internal
      // IPs (e.g. 169.254.169.254.nip.io), not just literal private IPs.
      const v = await validateExternalUrlAndResolve(row.url);
      if (!v.ok) {
        results[label] = `error: blocked URL (${v.error})`;
        await markSourceStatus(supabase, row.id, 'error', 0, `blocked URL (${v.error})`);
        continue;
      }
      try {
        const res = await fetch(v.url.toString(), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44/1.0; +https://remotejobs44.com)',
            'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, application/json, */*',
          },
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        // Cheap pre-check: reject giants by the declared Content-Length BEFORE
        // buffering the whole body into memory. The header is optional and
        // lie-able, so the post-buffer length check below is still the
        // authoritative cap — this just avoids OOMing the cron function on an
        // honest multi-hundred-MB response. (Same pattern as /api/rss.)
        const declaredLen = parseInt(res.headers.get('content-length') ?? '0', 10);
        if (declaredLen > MAX_FEED_BYTES) throw new Error('response body too large (>5MB) — not a feed');

        const body = await res.text();
        if (body.length > MAX_FEED_BYTES) throw new Error('response body too large (>5MB) — not a feed');
        const contentType = res.headers.get('content-type') ?? '';
        let parsed = parseFeed(body, contentType, row.url);

        // Admins paste job-board listing pages (WordPress boards etc.),
        // not feed URLs. When the body is HTML, look for the feed the
        // page advertises (or WP Job Manager's well-known job_feed) and
        // retry against that before declaring the source broken.
        if (parsed.method === 'unknown' && looksLikeHtml(body, contentType)) {
          const found = await tryDiscoveredFeeds(body, v.url.toString());
          if (found) {
            logInfo({ event: 'ingest.feed_discovered', source: label, feed: found.feedUrl });
            parsed = found.parsed;
          } else {
            const msg = 'HTML page with no discoverable job feed — paste the feed URL itself (WP Job Manager boards expose /feed/job_feed/)';
            results[label] = `error: ${msg}`;
            await markSourceStatus(supabase, row.id, 'error', 0, msg);
            continue;
          }
        }
        if (parsed.method === 'unknown') {
          results[label] = `error: ${parsed.error ?? 'unrecognised format'}`;
          await markSourceStatus(supabase, row.id, 'error', 0, parsed.error ?? 'unrecognised format');
          continue;
        }

        // parse* emit the camelCase preview shape; convert to jobs-table
        // rows (snake_case, no synthetic id) before the scam screen and
        // dedupe — both read DB column names like apply_url. Cap like the
        // hardcoded sources: parseXMLFeed has no item limit of its own,
        // and an unbounded feed otherwise becomes an unbounded .in() query.
        let rows = parsed.jobs
          .slice(0, MAX_JOBS_PER_SOURCE)
          .map(j => feedJobToDbRow(j, row.url))
          .filter((j): j is Record<string, any> => !!j && !!j.apply_url);

        // WP Job Manager boards: feed items link to the board's own
        // /job/... detail pages, not the employer. Swap in the direct
        // apply link from each new item's detail page so applicants land
        // on the company's posting instead of bouncing through the board.
        let knownSeenUrls: string[] = [];
        if (parsed.flavor === 'wp-job-manager' && rows.length) {
          const wpjm = await prepareWpjmRows(supabase, rows, label);
          rows = wpjm.rows;
          knownSeenUrls = wpjm.knownApplyUrls;
        }

        // Scam screen runs on the final apply targets (post-enrichment).
        const jobs = rows.map((j): Record<string, any> => {
          const scam = detectScam(j);
          return scam
            ? { ...j, flagged: true,  flagged_reason: scam.flagged_reason }
            : { ...j, flagged: false, flagged_reason: null };
        });

        if (!jobs.length) {
          // Still bump last_seen for previously-ingested items that are
          // in the feed this run, so they don't age out at 60 days.
          if (knownSeenUrls.length) {
            await touchLastSeen(supabase, knownSeenUrls, label);
          }
          results[label] = 0;
          await markSourceStatus(supabase, row.id, 'active', 0);
          continue;
        }

        const deduped = dedupeByApplyUrl(jobs);
        const up = await upsertJobsChunked(supabase, deduped);
        if (up.inserted === 0 && up.failed > 0) {
          results[label] = `db error: ${up.firstError ?? 'insert failed'}`;
          await markSourceStatus(supabase, row.id, 'error', 0, up.firstError);
        } else {
          results[label] = up.failed > 0
            ? `${up.inserted} (${up.failed} rows failed: ${up.firstError})`
            : up.inserted;
          totalAdded += up.inserted;
          await touchLastSeen(supabase, deduped.map(r => r.apply_url), label);
          if (knownSeenUrls.length) {
            await touchLastSeen(supabase, knownSeenUrls, label);
          }
          await markSourceStatus(supabase, row.id, 'active', up.inserted);
        }
      } catch (err: any) {
        logError({ event: 'ingest.user_source_failed', source: label, error: err.message });
        results[label] = `error: ${err.message}`;
        await markSourceStatus(supabase, row.id, 'error', 0, err.message);
      }
    }
  } catch (err: any) {
    logWarn({ event: 'ingest.user_sources_read_failed', error: err.message });
  }

    return {
      success:    true,
      totalAdded,
      results,
      paused:     pausedNames,
      at:         new Date().toISOString(),
    };
  } finally {
    // Release the lock no matter how the pipeline exited (early return,
    // thrown error caught by the route's outer try, normal completion).
    // If the RPC isn't there (pre-v14 envs) this is a no-op; the TTL
    // self-heal kicks in instead.
    try {
      await supabase.rpc('release_cron_lock', { lock_name: INGEST_LOCK_NAME });
    } catch (err: any) {
      logWarn({ event: 'ingest.lock_release_failed', error: err.message });
    }
  }
}

// ── JobSpy ingest ───────────────────────────────────────────────────────────
//
// JobSpy scrapes LinkedIn / Indeed / ZipRecruiter / Google Jobs through a
// self-hosted JobSpy API (lib/jobspy.ts). It runs on its own daily cron
// (/api/cron/jobspy) instead of inside runIngest() — the scraper is slow and
// was getting starved at the tail of the shared source budget. Each default
// query is handled like a source: fetch → normalise → scam-screen → dedupe on
// apply_url → DROP anything already on the platform from ANY source → upsert.
// That drop step is the cross-source guarantee: JobSpy never re-lists a role
// another feed already carries.
//
// Coverage over speed: with a broad query set and a slow scraper, not every
// query fits in one run, so we rotate the starting query by day and work
// within a time budget — the whole set comes round over a couple of days even
// if one run only gets partway through.
const JOBSPY_LOCK_NAME = 'jobspy';
const JOBSPY_LOCK_TTL_SECONDS = 10 * 60;
const JOBSPY_RESULTS_WANTED = 50;         // per-query target handed to the scraper
const JOBSPY_COMPANY_PROBE_CHUNK = 100;   // companies per platform-dedup probe query

export async function runJobSpyIngest(opts?: { budgetMs?: number }): Promise<IngestResult> {
  const startedAt = Date.now();
  const budgetMs = opts?.budgetMs ?? 100_000;
  const results: Record<string, number | string> = {};
  let totalAdded = 0;

  if (!isJobSpyConfigured()) {
    return {
      success: true, totalAdded: 0,
      results: { JobSpy: 'not configured (JOBSPY_API_URL unset)' },
      paused: [], at: new Date().toISOString(),
      skipped: true, reason: 'JobSpy is not configured.',
    };
  }

  const supabase = createAdminSupabaseClient();

  // Own lock, separate from the 'ingest' lock, so the JobSpy cron and the feed
  // ingest can run at their own times without blocking each other — while two
  // JobSpy runs still can't overlap and double-scrape.
  try {
    const { data: acquired, error } = await supabase.rpc('try_acquire_cron_lock', {
      lock_name: JOBSPY_LOCK_NAME, ttl_seconds: JOBSPY_LOCK_TTL_SECONDS,
    });
    if (error) logWarn({ event: 'jobspy.lock_rpc_unavailable', error: error.message });
    else if (acquired === false) {
      logInfo({ event: 'jobspy.skipped', reason: 'lock_held' });
      return {
        success: true, totalAdded: 0, results: {}, paused: [],
        at: new Date().toISOString(), skipped: true,
        reason: 'Another JobSpy run is already in progress.',
      };
    }
  } catch (err: any) {
    logWarn({ event: 'jobspy.lock_acquire_threw', error: err.message });
  }

  try {
    // Admins can pause a JobSpy query from /admin/sources by its job_sources
    // URL, same as any other source.
    let pausedUrls = new Set<string>();
    try {
      const { data } = await supabase.from('job_sources').select('url').eq('status', 'paused');
      pausedUrls = new Set((data ?? []).map((r: { url: string }) => r.url));
    } catch (err: any) {
      logWarn({ event: 'jobspy.paused_sources_read_failed', error: err.message });
    }
    const pausedNames: string[] = [];

    for (const query of rotateByDay(JOBSPY_DEFAULT_QUERIES)) {
      const sourceUrl = jobSpySourceUrl(query);
      const name = `JobSpy:${query.replace(/^remote ?/, '') || 'all'}`;

      if (pausedUrls.has(sourceUrl)) {
        pausedNames.push(name);
        results[name] = 'paused';
        continue;
      }
      // Out of budget: skip the rest. The day-rotation means a different slice
      // leads next run, so nothing is permanently starved.
      if (Date.now() - startedAt > budgetMs) {
        results[name] = 'skipped: JobSpy time budget exhausted, runs earlier next cycle';
        continue;
      }

      const source: Source = {
        name, sourceUrl,
        fetch: (): Promise<RawJob[]> =>
          fetchJobSpyJobs({ searchTerm: query, resultsWanted: JOBSPY_RESULTS_WANTED, isRemote: true }),
        normalise: (j: RawJob): Record<string, any> | null => jobSpyJobToDbRow(j as any),
      };

      try {
        const raw = await source.fetch();
        const jobs = raw.slice(0, MAX_JOBS_PER_SOURCE)
          .map(source.normalise)
          .filter((j): j is Record<string, any> => !!j && !!j.apply_url)
          .map((j): Record<string, any> => {
            const scam = detectScam(j);
            return scam
              ? { ...j, flagged: true,  flagged_reason: scam.flagged_reason }
              : { ...j, flagged: false, flagged_reason: null };
          });

        if (!jobs.length) {
          results[name] = 0;
          await recordSourceRun(supabase, source, 0, 'ok');
          continue;
        }

        // 1) collapse in-batch apply_url repeats, 2) drop anything already on
        // the platform from any source, 3) upsert the genuinely-new remainder.
        const deduped = dedupeByApplyUrl(jobs);
        const { kept, dropped } = await filterExistingOnPlatform(supabase, deduped);
        const up = kept.length
          ? await upsertJobsChunked(supabase, kept)
          : { inserted: 0, failed: 0, firstError: null };

        const suffix = dropped > 0 ? ` (+${dropped} already on platform)` : '';
        if (up.inserted === 0 && up.failed > 0) {
          results[name] = `db error: ${up.firstError ?? 'insert failed'}`;
          await recordSourceRun(supabase, source, 0, 'error', up.firstError);
        } else {
          results[name] = up.failed > 0
            ? `${up.inserted} (${up.failed} rows failed: ${up.firstError})${suffix}`
            : `${up.inserted}${suffix}`;
          totalAdded += up.inserted;
          // Bump last_seen for the kept rows AND the cross-source dupes we
          // skipped: the platform's existing copy of a still-listed role must
          // stay fresh so it doesn't age out just because JobSpy deferred to it.
          await touchLastSeen(supabase, deduped.map(r => r.apply_url), source.name);
          await recordSourceRun(supabase, source, up.inserted, 'ok');
        }
      } catch (err: any) {
        logError({ event: 'jobspy.query_failed', query, error: err.message });
        results[name] = `error: ${err.message}`;
        await recordSourceRun(supabase, source, 0, 'error', err.message);

        // A missing deployment, bad API key, or invalid route affects every
        // query. Stop after the first permanent 4xx instead of issuing the
        // same doomed request across the entire query catalogue.
        if (err instanceof JobSpyHttpError && err.permanent) {
          return {
            success: false,
            totalAdded,
            results,
            paused: pausedNames,
            at: new Date().toISOString(),
            skipped: true,
            reason: `JobSpy service unavailable (HTTP ${err.status}). Check JOBSPY_API_URL and credentials.`,
          };
        }
      }
    }

    return {
      success: true, totalAdded, results,
      paused: pausedNames, at: new Date().toISOString(),
    };
  } finally {
    try { await supabase.rpc('release_cron_lock', { lock_name: JOBSPY_LOCK_NAME }); }
    catch (err: any) { logWarn({ event: 'jobspy.lock_release_failed', error: err.message }); }
  }
}

// Drop rows whose (title, company, location) identity already exists as an
// ACTIVE job on the platform, from any source. We probe by company (chunked) —
// the most selective identity field — collect those rows' identities, and let
// filterByIdentity (lib/dedupe-jobs) do the pure comparison with the SAME key
// the nightly dedupe_jobs() RPC uses. Casing-variant company names this
// exact-match probe misses are still caught by that nightly sweep, so this is
// the cheap first line, not the only one. Best-effort: on a probe error we keep
// the batch (the apply_url unique index + nightly sweep remain as backstops).
async function filterExistingOnPlatform(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  rows: Array<Record<string, any>>,
): Promise<{ kept: Array<Record<string, any>>; dropped: number }> {
  if (!rows.length) return { kept: rows, dropped: 0 };
  const companies = Array.from(new Set(
    rows.map(r => String(r.company ?? '').trim()).filter(Boolean),
  ));
  if (!companies.length) return { kept: rows, dropped: 0 };

  const existing = new Set<string>();
  try {
    for (let i = 0; i < companies.length; i += JOBSPY_COMPANY_PROBE_CHUNK) {
      const chunk = companies.slice(i, i + JOBSPY_COMPANY_PROBE_CHUNK);
      const { data, error } = await supabase
        .from('jobs')
        .select('title, company, location')
        .in('company', chunk)
        .eq('is_active', true);
      if (error) throw error;
      for (const r of data ?? []) existing.add(jobIdentityKey(r as any));
    }
  } catch (err: any) {
    logWarn({ event: 'jobspy.platform_dedup_probe_failed', error: err?.message ?? String(err) });
    return { kept: rows, dropped: 0 };
  }
  return filterByIdentity(rows, existing);
}

// Rotate an array by the current UTC day so a budget-limited run doesn't always
// start from the same query. The clock read is deliberate (daily fairness) and
// isolated here.
function rotateByDay<T>(arr: T[]): T[] {
  if (arr.length <= 1) return arr.slice();
  const dayNumber = Math.floor(Date.now() / 86_400_000); // whole days since epoch (UTC)
  const offset = dayNumber % arr.length;
  return [...arr.slice(offset), ...arr.slice(0, offset)];
}

// last_seen_at bumps go through lib/jobs-last-seen.ts. The local copy that
// used to live here sent every apply_url in the batch as one PostgREST IN
// list and discarded the returned error, so an over-long request line failed
// silently and the postings it covered aged out of the 60-day staleness sweep
// while their feeds were still listing them. The shared helper batches by
// request size and logs what fails.

// Chunked upsert with row-level isolation. The search_vector GIN trigger
// can't take big INSERT batches reliably, and a single bad row in a
// 200-row statement used to zero the entire source's run (the whole
// statement fails). Chunks of 25; a failing chunk retries row-by-row so
// one bad row costs exactly one row, reported instead of swallowed.
async function upsertJobsChunked(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  rows: Array<Record<string, any>>,
): Promise<{ inserted: number; failed: number; firstError: string | null }> {
  let inserted = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (let i = 0; i < rows.length; i += JOBS_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + JOBS_INSERT_CHUNK);
    const { data, error } = await supabase
      .from('jobs')
      .upsert(chunk, { onConflict: 'apply_url', ignoreDuplicates: true })
      .select('id');
    if (!error) {
      inserted += data?.length ?? 0;
      continue;
    }
    for (const r of chunk) {
      const { data: one, error: rowErr } = await supabase
        .from('jobs')
        .upsert(r, { onConflict: 'apply_url', ignoreDuplicates: true })
        .select('id');
      if (rowErr) {
        failed++;
        if (!firstError) firstError = rowErr.message;
      } else {
        inserted += one?.length ?? 0;
      }
    }
  }
  return { inserted, failed, firstError };
}

// WP Job Manager feeds: make the board's /job/... page each row's
// source_url — a stable per-item key that keeps provenance for admins
// and lets us recognise items we already ingested even after apply_url
// was swapped for the employer's link. Items already in the DB are
// dropped from the insert (their apply URLs are returned so the caller
// can bump last_seen_at). Up to WPJM_ENRICH_MAX new detail pages are
// fetched to extract the direct apply target; new items beyond the cap
// are deferred to the next run so they're enriched eventually rather
// than stored with a permanent board link. Pages that fail to fetch
// keep the board link — degraded, never dropped.
async function prepareWpjmRows(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  rows: Array<Record<string, any>>,
  label: string,
): Promise<{ rows: Array<Record<string, any>>; knownApplyUrls: string[] }> {
  const withKeys = rows.map(r => ({ ...r, source_url: r.apply_url }));
  const links = withKeys.map(r => r.source_url as string);

  const knownLinks = new Set<string>();
  const knownApplyUrls: string[] = [];
  // Batched for the same reason as the last_seen_at bumps: this IN list is
  // board detail-page URLs, and sending 200 of them at once overruns the
  // PostgREST request line. supabase-js returns that as { error }, not a
  // throw, so the previous single-shot version reported "nothing known" and we
  // re-enriched every item on every run — burning the WPJM_ENRICH_MAX budget
  // on items already stored instead of on the new ones.
  for (const batch of batchByLength(links)) {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('apply_url, source_url')
        .in('source_url', batch);
      if (error) throw new Error(error.message);
      for (const k of data ?? []) {
        knownLinks.add(k.source_url as string);
        if (k.apply_url) knownApplyUrls.push(k.apply_url as string);
      }
    } catch (err: any) {
      // Non-fatal: worst case we re-enrich known items and the apply_url
      // upsert dedupes them.
      logWarn({ event: 'ingest.wpjm_known_check_failed', source: label, error: err?.message ?? String(err) });
    }
  }

  const fresh = withKeys.filter(r => !knownLinks.has(r.source_url));
  const toEnrich = fresh.slice(0, WPJM_ENRICH_MAX);
  const deferred = fresh.length - toEnrich.length;

  const enriched = await enrichDirectApplyLinks(toEnrich, { timeoutMs: 5_000 });
  logInfo({
    event: 'ingest.wpjm_enrich', source: label,
    newItems: fresh.length, fetched: enriched.fetched, direct: enriched.enriched,
    emails: enriched.emails, failed: enriched.failed, deferred,
  });
  return { rows: enriched.rows, knownApplyUrls };
}

// Lightweight update-by-id used for user-added sources. (recordSourceRun
// upserts by URL which is the right shape for the hardcoded adapters,
// but here we already have the row id so a direct UPDATE is cheaper.)
async function markSourceStatus(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  id: string,
  status: 'active' | 'error',
  jobsAdded: number,
  errorMessage: string | null = null,
) {
  try {
    await supabase
      .from('job_sources')
      .update({
        status,
        last_sync_at: new Date().toISOString(),
        jobs_added:   jobsAdded,
        error_message: status === 'active' ? null : (errorMessage ?? null),
      })
      .eq('id', id);
  } catch {}
}

async function recordSourceRun(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  source: Source,
  added: number,
  status: 'ok' | 'error',
  errorMessage: string | null = null,
) {
  try {
    await supabase.from('job_sources').upsert({
      name: source.name,
      url:  source.sourceUrl,
      method: 'json-api',
      status: status === 'ok' ? 'active' : 'error',
      last_sync_at: new Date().toISOString(),
      jobs_added: added,
      // Persist the failure so /admin/sources shows WHY a feed broke instead
      // of a blank row; clear it on a clean run so a recovered source looks
      // healthy again rather than carrying a stale error forever.
      error_message: status === 'ok' ? null : (errorMessage ?? null),
    }, { onConflict: 'url' });
  } catch {}
}

function parseSerpDate(relative: string): string {
  const now = Date.now();
  const r = relative.toLowerCase();
  const num = parseInt(r) || 1;
  if (/hour/.test(r))  return new Date(now - num * 3600000).toISOString();
  if (/day/.test(r))   return new Date(now - num * 86400000).toISOString();
  if (/week/.test(r))  return new Date(now - num * 604800000).toISOString();
  if (/month/.test(r)) return new Date(now - num * 2592000000).toISOString();
  return new Date().toISOString();
}

// Free APIs drift: fields documented as strings arrive as arrays
// (Jobicy's jobType/jobIndustry) or numbers. Coerce before any string
// method — a single `e.toLowerCase is not a function` throw kills the
// whole source's run.
function textOf(v: unknown): string {
  if (Array.isArray(v)) return v.map(x => textOf(x)).join(' ');
  if (v === null || v === undefined) return '';
  return String(v);
}

// First letter for the fallback logo. `(name ?? 'U')[0].toUpperCase()`
// crashes on '' (Findwork sends empty company_name) — ''[0] is undefined.
function firstChar(v: unknown): string {
  const s = textOf(v).trim();
  return (s ? s[0] : 'U').toUpperCase();
}

// posted_at must be ISO. Some APIs send epoch seconds (Himalayas'
// pubDate) which Postgres rejects as "date/time field value out of
// range"; epoch millis would silently parse as year ~58000.
function toIso(v: unknown): string {
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{9,13}$/.test(v.trim()))) {
    const n = Number(v);
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function mapCat(raw: unknown): string {
  const r = textOf(raw).toLowerCase();
  if (/product manager|product lead|product owner/.test(r)) return 'product';
  if (/data science|data engineer|machine learning|ml engineer|analytics/.test(r)) return 'data';
  if (/marketing|seo|content|growth|brand|social media|copywriter/.test(r)) return 'marketing';
  if (/finance|accounting|payroll|controller/.test(r)) return 'finance';
  if (/sales|account exec|bdr|sdr|business dev/.test(r)) return 'sales';
  if (/recruiter|talent|hr manager|people ops|human resources/.test(r)) return 'hr';
  if (/legal|counsel|compliance|attorney/.test(r)) return 'legal';
  if (/design|ux|ui|figma|graphic/.test(r)) return 'design';
  if (/operations|ops|customer success/.test(r)) return 'operations';
  if (/engineer|developer|software|devops|backend|frontend|fullstack|cloud|infrastructure|security/.test(r)) return 'engineering';
  return 'other';
}

function mapLevel(title: unknown): string {
  const t = textOf(title).toLowerCase();
  if (/vp |chief|cto|ceo|coo|president|director/.test(t)) return 'executive';
  if (/lead|staff|principal|head of/.test(t)) return 'lead';
  if (/senior|sr\./.test(t)) return 'senior';
  if (/junior|jr\.?|entry|graduate|intern/.test(t)) return 'entry';
  return 'mid';
}

function mapType(raw: unknown): string {
  const t = textOf(raw).toLowerCase();
  if (/part.time/.test(t)) return 'part-time';
  if (/contract|freelance/.test(t)) return 'contract';
  if (/intern/.test(t)) return 'internship';
  return 'full-time';
}
