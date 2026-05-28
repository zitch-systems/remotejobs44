// lib/ingest-pipeline.ts
// Pulls remote jobs from every active source in the in-code SOURCES list
// (Remotive, Jobicy, RemoteOK, Arbeitnow, Findwork (if key), SerpApi (if
// key)) and inserts them into public.jobs. Per the no-dedup decision
// recorded in user memory we do NOT upsert by apply_url; each daily run
// inserts fresh rows. Stale rows are downgraded by the daily cron's
// separate staleness pass (jobs.is_active = false after 60 days), so the
// public listings stay current without losing history.
//
// Called by:
//   * /api/cron/daily       — scheduled cron, the single daily 6am UTC run
//   * /api/cron/ingest      — manual debug re-trigger (same auth secret)
//   * /api/admin/ingest-now — admin "run now" button
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { detectScam } from '@/lib/scam-detect';
import { parseFeed } from '@/lib/feed-parser';
import { validateExternalUrl } from '@/lib/ssrf-guard';
import { logInfo, logWarn, logError } from '@/lib/log';

const FINDWORK_KEY = process.env.FINDWORK_API_KEY ?? '';
const SERP_KEY     = process.env.SERPAPI_KEY ?? '';

// Shared fetch helper — throws on non-2xx so we don't try to .json() a 404 HTML
// page or 500 error body. The per-source try/catch in runIngest catches the
// throw and isolates the failure to that one source.
async function getJson(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} ${url}`);
  return r.json();
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
      const d = await getJson('https://remotive.com/api/remote-jobs?limit=50', { signal: AbortSignal.timeout(15000) });
      return asArray(d.jobs);
    },
    normalise: (j) => ({
      title: j.title ?? 'Untitled', company: j.company_name ?? 'Unknown',
      logo: (j.company_name ?? 'U')[0].toUpperCase(),
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
      logo: (j.companyName ?? j.company ?? 'U')[0].toUpperCase(),
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
      logo: (j.company ?? 'U')[0].toUpperCase(),
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
      logo: (j.company_name ?? 'U')[0].toUpperCase(),
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
      logo: (j.company_name ?? 'U')[0].toUpperCase(),
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
      const d = await getJson('https://himalayas.app/jobs/api?limit=50', {
        headers: { 'User-Agent': 'RemoteJobs44/1.0 (hello@remotejobs44.com)' },
        signal: AbortSignal.timeout(15000),
      });
      return asArray(d.jobs ?? d.data);
    },
    normalise: (j) => ({
      title: j.title ?? j.jobTitle ?? 'Untitled',
      company: j.companyName ?? j.company ?? 'Unknown',
      logo: (j.companyName ?? j.company ?? 'U')[0].toUpperCase(),
      category: mapCat(Array.isArray(j.categories) ? j.categories.join(' ') : (j.title ?? '')),
      type: mapType(j.employmentType ?? 'full-time'),
      level: mapLevel(j.title ?? ''),
      location: j.locationRestrictions?.[0] ?? j.location ?? 'Worldwide',
      description: (j.excerpt ?? j.description ?? '').slice(0, 5000),
      salary_min: j.minBaseSalary ?? null,
      salary_max: j.maxBaseSalary ?? null,
      currency: j.currency ?? 'USD',
      apply_url: j.applicationLink ?? j.url ?? null,
      posted_at: j.pubDate ?? j.publishDate ?? new Date().toISOString(),
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
      logo: (j.company_name ?? 'U')[0].toUpperCase(),
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
        logo: (j.company_name ?? 'U')[0].toUpperCase(),
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
    try {
      const raw = await source.fetch();
      const jobs = raw.slice(0, 50)
        .map(source.normalise)
        .filter((j): j is Record<string, any> => !!j && !!j.apply_url)
        .map(j => {
          // First-pass scam screen — flag suspicious rows in place so an
          // admin can sweep them at /admin/jobs. We don't drop the row;
          // public listing queries filter `.eq('flagged', false)`. Letting
          // legit jobs slip through with a flag is recoverable; letting
          // scams reach paying users isn't.
          const scam = detectScam(j);
          if (scam) {
            return { ...j, flagged: true, flagged_reason: scam.flagged_reason };
          }
          return j;
        });

      if (!jobs.length) {
        results[source.name] = 0;
        await recordSourceRun(supabase, source, 0, 'ok');
        continue;
      }

      // ⚠️  Dedup-by-apply_url was removed at user request (migration_v5).
      // Every cron run now inserts a fresh copy of every job — after a
      // week, each posting appears ~7 times in DB. Re-enable upsert here
      // (and re-create the unique index) if dedup is wanted again.
      const { data: inserted, error } = await supabase
        .from('jobs')
        .insert(jobs)
        .select('id');

      if (error) {
        results[source.name] = `db error: ${error.message}`;
        await recordSourceRun(supabase, source, 0, 'error');
      } else {
        const n = inserted?.length ?? 0;
        results[source.name] = n;
        totalAdded += n;
        await recordSourceRun(supabase, source, n, 'ok');
      }
    } catch (err: any) {
      logError({ event: 'ingest.source_failed', source: source.name, error: err.message });
      results[source.name] = `error: ${err.message}`;
      await recordSourceRun(supabase, source, 0, 'error');
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
    const { data: customRows } = await supabase
      .from('job_sources')
      .select('id, name, url, method')
      .eq('status', 'active');
    const customSources = (customRows ?? []).filter(r => !hardcodedUrls.has(r.url));

    for (const row of customSources) {
      const label = row.name || row.url;
      // Re-validate URL on every run. A row may have been inserted via
      // SQL (bypassing the API's SSRF guard) so we can't assume it's safe.
      const v = validateExternalUrl(row.url);
      if (!v.ok) {
        results[label] = `error: blocked URL (${v.error})`;
        await markSourceStatus(supabase, row.id, 'error', 0);
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

        const body = await res.text();
        const parsed = parseFeed(body, res.headers.get('content-type') ?? '', row.url);
        if (parsed.method === 'unknown') {
          results[label] = `error: ${parsed.error ?? 'unrecognised format'}`;
          await markSourceStatus(supabase, row.id, 'error', 0);
          continue;
        }

        const jobs = parsed.jobs
          .filter((j): j is Record<string, any> => !!j && !!j.apply_url)
          .map(j => {
            const scam = detectScam(j);
            return scam ? { ...j, flagged: true, flagged_reason: scam.flagged_reason } : j;
          });

        if (!jobs.length) {
          results[label] = 0;
          await markSourceStatus(supabase, row.id, 'active', 0);
          continue;
        }

        const { data: inserted, error: insErr } = await supabase
          .from('jobs')
          .insert(jobs)
          .select('id');
        if (insErr) {
          results[label] = `db error: ${insErr.message}`;
          await markSourceStatus(supabase, row.id, 'error', 0);
        } else {
          const n = inserted?.length ?? 0;
          results[label] = n;
          totalAdded += n;
          await markSourceStatus(supabase, row.id, 'active', n);
        }
      } catch (err: any) {
        logError({ event: 'ingest.user_source_failed', source: label, error: err.message });
        results[label] = `error: ${err.message}`;
        await markSourceStatus(supabase, row.id, 'error', 0);
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

// Lightweight update-by-id used for user-added sources. (recordSourceRun
// upserts by URL which is the right shape for the hardcoded adapters,
// but here we already have the row id so a direct UPDATE is cheaper.)
async function markSourceStatus(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  id: string,
  status: 'active' | 'error',
  jobsAdded: number,
) {
  try {
    await supabase
      .from('job_sources')
      .update({
        status,
        last_sync_at: new Date().toISOString(),
        jobs_added:   jobsAdded,
      })
      .eq('id', id);
  } catch {}
}

async function recordSourceRun(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  source: Source,
  added: number,
  status: 'ok' | 'error'
) {
  try {
    await supabase.from('job_sources').upsert({
      name: source.name,
      url:  source.sourceUrl,
      method: 'json-api',
      status: status === 'ok' ? 'active' : 'error',
      last_sync_at: new Date().toISOString(),
      jobs_added: added,
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

function mapCat(raw: string): string {
  const r = raw.toLowerCase();
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

function mapLevel(title: string): string {
  const t = title.toLowerCase();
  if (/vp |chief|cto|ceo|coo|president|director/.test(t)) return 'executive';
  if (/lead|staff|principal|head of/.test(t)) return 'lead';
  if (/senior|sr\./.test(t)) return 'senior';
  if (/junior|jr\.?|entry|graduate|intern/.test(t)) return 'entry';
  return 'mid';
}

function mapType(raw: string): string {
  const t = raw.toLowerCase();
  if (/part.time/.test(t)) return 'part-time';
  if (/contract|freelance/.test(t)) return 'contract';
  if (/intern/.test(t)) return 'internship';
  return 'full-time';
}
