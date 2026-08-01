// lib/jobspy.ts
// JobSpy integration — pulls remote jobs from LinkedIn, Indeed, ZipRecruiter
// and Google Jobs via a JobSpy API service (the FastAPI/HTTP wrapper around
// the `python-jobspy` scraper). JobSpy itself is a Python library and can't
// run inside this Next.js/serverless app, so we talk to a self-hosted JobSpy
// API over HTTP and treat it like any other JSON source. Configure it with:
//
//   JOBSPY_API_URL   base URL of the JobSpy API (e.g. https://jobspy.example.com)
//                    — or the full search endpoint if your deployment differs.
//   JOBSPY_API_KEY   optional; sent as the `x-api-key` header when set.
//   JOBSPY_SITES     optional comma list overriding the default board set.
//   JOBSPY_COUNTRY   optional country hint for Indeed (default 'usa').
//
// When JOBSPY_API_URL is unset the whole integration is inert: the ingest
// pipeline skips it and the admin page shows a setup hint. Nothing here throws
// at import time, so an un-keyed deploy is unaffected.
//
// Used by:
//   * lib/ingest-pipeline.ts        — daily cron + admin "Run Ingest Now"
//   * app/api/admin/jobspy/search   — admin "list all jobs available" preview
//   * app/admin/jobspy/page.tsx      — the admin JobSpy console

const RAW_API_URL = (process.env.JOBSPY_API_URL ?? '').trim();
const API_KEY     = (process.env.JOBSPY_API_KEY ?? '').trim();

// Boards JobSpy can scrape. Glassdoor is deliberately excluded — the product
// spec forbids referencing it anywhere — and any operator-supplied override is
// filtered against this allowlist so it can never sneak back in.
const ALLOWED_SITES = ['indeed', 'linkedin', 'zip_recruiter', 'google', 'bayt', 'naukri'] as const;
export type JobSpySite = (typeof ALLOWED_SITES)[number];

const DEFAULT_SITES: JobSpySite[] = ['indeed', 'linkedin', 'zip_recruiter', 'google'];

// Search terms the daily JobSpy cron works through — one broad query per
// platform job category (see mapCategory below) so a day's run pulls "all
// jobs" across the whole taxonomy, not just engineering. The cron rotates
// its starting point each day and works within a time budget, so if the
// scraper is slow and not every query fits in one run, coverage still comes
// round over a couple of days rather than always favouring the top of the
// list. Add a term here to widen coverage; keep them remote-first.
export const JOBSPY_DEFAULT_QUERIES = [
  'remote software engineer',
  'remote frontend developer',
  'remote backend developer',
  'remote devops engineer',
  'remote data scientist',
  'remote data analyst',
  'remote product manager',
  'remote designer',
  'remote marketing manager',
  'remote content writer',
  'remote sales representative',
  'remote customer success',
  'remote finance manager',
  'remote accountant',
  'remote human resources',
  'remote recruiter',
  'remote operations manager',
  'remote project manager',
  'remote legal counsel',
  'remote',
];

export interface JobSpySearchOptions {
  searchTerm:     string;
  location?:      string;
  sites?:         string[];
  resultsWanted?: number;
  hoursOld?:      number;
  isRemote?:      boolean;
  jobType?:       string;
  country?:       string;
}

// Normalised, camelCase shape — the same field names /api/ats/save and the
// admin UI expect. Kept separate from the snake_case DB row so both the
// preview path and the ingest path share one parser.
export interface JobSpyJob {
  title:       string;
  company:     string;
  location:    string;
  type:        string;
  category:    string;
  level:       string;
  description: string;
  applyUrl:    string;
  salaryMin:   number | null;
  salaryMax:   number | null;
  currency:    string;
  remote:      boolean;
  source:      'jobspy';
  site:        string;
  sourceUrl:   string;
  posted:      string;
}

export function isJobSpyConfigured(): boolean {
  return RAW_API_URL.length > 0;
}

/** Sites we'll actually query — env override filtered against the allowlist. */
export function jobSpySites(): JobSpySite[] {
  const raw = (process.env.JOBSPY_SITES ?? '').trim();
  if (!raw) return DEFAULT_SITES;
  const picked = raw
    .split(/[,\s]+/)
    .map(s => s.trim().toLowerCase().replace(/[-\s]/g, '_'))
    .filter((s): s is JobSpySite => (ALLOWED_SITES as readonly string[]).includes(s));
  return picked.length ? Array.from(new Set(picked)) : DEFAULT_SITES;
}

/** Config summary for the admin page (never exposes the API key itself). */
export function getJobSpyConfig(): {
  configured: boolean;
  host:       string | null;
  hasKey:     boolean;
  sites:      JobSpySite[];
  queries:    string[];
} {
  let host: string | null = null;
  if (RAW_API_URL) {
    try { host = new URL(resolveEndpoint(RAW_API_URL)).host; } catch { host = null; }
  }
  return {
    configured: isJobSpyConfigured(),
    host,
    hasKey:     API_KEY.length > 0,
    sites:      jobSpySites(),
    queries:    JOBSPY_DEFAULT_QUERIES,
  };
}

// Stable, readable identifier for one JobSpy query, used as the job_sources
// row URL so the pipeline's pause-matching and last-run recording line up and
// the admin Sources list shows a meaningful entry. Deterministic (no key
// leakage) whether or not JobSpy is configured.
export function jobSpySourceUrl(query: string): string {
  const base = RAW_API_URL ? resolveEndpoint(RAW_API_URL) : 'https://jobspy.invalid/api/v1/search_jobs';
  try {
    const u = new URL(base);
    u.searchParams.set('search_term', query);
    u.searchParams.set('is_remote', 'true');
    return u.toString();
  } catch {
    return `${base}?search_term=${encodeURIComponent(query)}`;
  }
}

// A JobSpy deployment may expose the search as a bare base URL or as the full
// endpoint. If the configured URL already points at a search/jobs path we use
// it verbatim; otherwise we append the wrapper's conventional route.
function resolveEndpoint(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  if (/\/(search|jobs)/i.test(trimmed)) return trimmed;
  return `${trimmed}/api/v1/search_jobs`;
}

// Fetch + normalise. Returns [] when JobSpy isn't configured so every caller
// can treat "no key" and "no results" identically. Throws on a real transport
// or upstream error so the ingest pipeline's per-source try/catch can isolate
// the failure (and the admin route can surface it).
export async function fetchJobSpyJobs(opts: JobSpySearchOptions): Promise<JobSpyJob[]> {
  if (!isJobSpyConfigured()) return [];

  const sites = (opts.sites && opts.sites.length
    ? opts.sites
        .map(s => s.trim().toLowerCase().replace(/[-\s]/g, '_'))
        .filter((s): s is JobSpySite => (ALLOWED_SITES as readonly string[]).includes(s))
    : jobSpySites());

  const endpoint = new URL(resolveEndpoint(RAW_API_URL));
  endpoint.searchParams.set('site_name', sites.join(','));
  endpoint.searchParams.set('search_term', opts.searchTerm);
  if (opts.location) endpoint.searchParams.set('location', opts.location);
  endpoint.searchParams.set('results_wanted', String(clampInt(opts.resultsWanted ?? 40, 1, 200)));
  if (opts.hoursOld && opts.hoursOld > 0) {
    endpoint.searchParams.set('hours_old', String(clampInt(opts.hoursOld, 1, 24 * 30)));
  }
  // Remote-first by default; only send is_remote=false when explicitly asked.
  endpoint.searchParams.set('is_remote', String(opts.isRemote !== false));
  if (opts.jobType) endpoint.searchParams.set('job_type', opts.jobType);
  // Indeed requires a country hint; harmless for the other boards.
  endpoint.searchParams.set('country_indeed', (opts.country ?? process.env.JOBSPY_COUNTRY ?? 'usa').toLowerCase());
  endpoint.searchParams.set('format', 'json');

  const headers = new Headers({
    'Accept': 'application/json, */*',
    'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44/1.0; +https://remotejobs44.com)',
  });
  if (API_KEY) headers.set('x-api-key', API_KEY);

  const raw = await getJson(endpoint.toString(), { headers });
  const list = extractJobArray(raw);

  return list
    .map(normaliseJobSpyJob)
    .filter((j): j is JobSpyJob => j !== null);
}

export function isPermanentJobSpyHttpStatus(status: number): boolean {
  return status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

export class JobSpyHttpError extends Error {
  readonly permanent: boolean;

  constructor(public readonly status: number, statusText: string) {
    super(`JobSpy API HTTP ${status} ${statusText}`);
    this.name = 'JobSpyHttpError';
    this.permanent = isPermanentJobSpyHttpStatus(status);
  }
}

// Shared fetch: browser-ish UA, JSON parse, one retry for transient failures,
// 25s timeout per attempt. Permanent 4xx configuration failures fail fast.
async function getJson(url: string, init?: RequestInit): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(res => setTimeout(res, 800 * attempt));
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new JobSpyHttpError(r.status, r.statusText);
      return await r.json();
    } catch (err) {
      if (err instanceof JobSpyHttpError && err.permanent) throw err;
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// JobSpy API wrappers differ in envelope: some return `{ jobs: [...] }`,
// some `{ data: [...] }` or `{ results: [...] }`, some a bare array. Pull the
// job array out of whichever shape came back.
function extractJobArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const key of ['jobs', 'data', 'results', 'items']) {
    if (Array.isArray(raw[key])) return raw[key];
  }
  return [];
}

// Map one raw JobSpy record to the normalised shape. Returns null when there's
// no usable apply URL — a job we can't send an applicant to is worthless.
// JobSpy's DataFrame columns vary a little across versions, so every field is
// read defensively with a couple of aliases.
export function normaliseJobSpyJob(j: any): JobSpyJob | null {
  if (!j || typeof j !== 'object') return null;

  const applyUrl = firstUrl(j.job_url_direct, j.job_url, j.url, j.apply_url, j.link);
  if (!applyUrl) return null;

  const title   = textOf(j.title ?? j.job_title).trim() || 'Untitled';
  const company = textOf(j.company ?? j.company_name ?? j.employer).trim() || 'Unknown';
  const site    = textOf(j.site ?? j.site_name ?? j.source).trim().toLowerCase() || 'jobspy';

  return {
    title,
    company,
    location:    locationOf(j) || 'Worldwide',
    type:        mapType(j.job_type ?? j.type ?? j.employment_type),
    category:    mapCategory(`${title} ${textOf(j.category)} ${textOf(j.description).slice(0, 200)}`),
    level:       mapLevel(title),
    description: textOf(j.description ?? j.job_description).slice(0, 5000),
    applyUrl,
    salaryMin:   toAmount(j.min_amount ?? j.salary_min ?? j.min_salary),
    salaryMax:   toAmount(j.max_amount ?? j.salary_max ?? j.max_salary),
    currency:    (textOf(j.currency).trim() || 'USD').toUpperCase().slice(0, 3),
    remote:      j.is_remote === false ? false : true,
    source:      'jobspy',
    site,
    sourceUrl:   firstUrl(j.job_url, j.url, j.company_url) ?? applyUrl,
    posted:      toIso(j.date_posted ?? j.posted_at ?? j.date),
  };
}

// Convert a normalised JobSpy job into a jobs-table row (snake_case), the same
// shape lib/ingest-pipeline.ts's SOURCES emit. The pipeline runs the scam
// screen and sets flagged/flagged_reason afterwards, so we don't set them here.
export function jobSpyJobToDbRow(j: JobSpyJob): Record<string, any> {
  return {
    title:      j.title,
    company:    j.company,
    logo:       firstChar(j.company),
    category:   j.category,
    type:       j.type,
    level:      j.level,
    location:   j.location,
    description: j.description,
    salary_min: j.salaryMin,
    salary_max: j.salaryMax,
    currency:   j.currency,
    apply_url:  j.applyUrl,
    posted_at:  j.posted,
    source:     'jobspy',
    source_url: j.sourceUrl,
    remote:     j.remote,
    featured:   false,
    is_new:     true,
    is_active:  true,
  };
}

// ── small, self-contained mappers (mirrors lib/ingest-pipeline.ts) ──────────

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function textOf(v: unknown): string {
  if (Array.isArray(v)) return v.map(x => textOf(x)).join(' ');
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

function firstChar(v: unknown): string {
  const s = textOf(v).trim();
  return (s ? s[0] : 'U').toUpperCase();
}

function firstUrl(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = textOf(v).trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.protocol === 'http:' || u.protocol === 'https:') return s;
    } catch { /* not a URL — keep looking */ }
  }
  return null;
}

// JobSpy location can be a string or a { country, city, state } object.
function locationOf(j: any): string {
  const loc = j.location ?? j.job_location;
  if (typeof loc === 'string') return loc.trim();
  if (loc && typeof loc === 'object') {
    const parts = [loc.city, loc.state, loc.country].map((p: unknown) => textOf(p).trim()).filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  const flat = [j.city, j.state, j.country].map(p => textOf(p).trim()).filter(Boolean);
  return flat.join(', ');
}

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toIso(v: unknown): string {
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{9,13}$/.test(String(v).trim()))) {
    const n = Number(v);
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v.trim());
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function mapCategory(raw: unknown): string {
  const r = textOf(raw).toLowerCase();
  if (/product manager|product lead|product owner/.test(r)) return 'product';
  if (/data science|data engineer|machine learning|ml engineer|analytics|data analyst/.test(r)) return 'data';
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
  if (/part.?time/.test(t)) return 'part-time';
  if (/contract|freelance|temporary/.test(t)) return 'contract';
  if (/intern/.test(t)) return 'internship';
  return 'full-time';
}
