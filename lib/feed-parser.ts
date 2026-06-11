// lib/feed-parser.ts
// Pure feed-parsing helpers shared by /api/rss (admin "preview a source"
// + "fetch this RSS URL" path) and the ingestion pipeline. Extracted so
// the cron can normalize user-added sources from `job_sources` without
// making an HTTP roundtrip to /api/rss for each one.
//
// Handles three input shapes:
//   * RSS 2.0           — <rss><channel><item>...</item></channel></rss>
//   * Atom              — <feed><entry>...</entry></feed>
//   * JSON feed         — { jobs / data / results / positions / listings: [...] }
//                         or raw array
//
// Returns the same shape /api/rss produces, so the existing route can
// just call into here.
import { normalizeJob } from '@/lib/ingestion';

export interface ParsedFeed {
  jobs:    Array<Record<string, any>>;
  total:   number;
  method:  'rss' | 'json-api' | 'unknown';
  error?:  string;
}

const STRIP_HTML_MAX = 1000;

// ── XML / RSS / Atom ──────────────────────────────────────────────────
export function parseXMLFeed(xml: string, sourceUrl: string): ParsedFeed {
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  const items: Record<string, string>[] = [];

  const itemTag = isAtom ? 'entry' : 'item';
  const itemRegex = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, 'gi');
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title:       extractTag(block, 'title') ?? extractTag(block, 'a10:title') ?? '',
      link:        extractTag(block, 'link') ?? extractAttr(block, 'link', 'href') ?? '',
      company:     extractTag(block, 'company') ?? extractTag(block, 'author') ?? extractTag(block, 'dc:creator') ?? '',
      description: stripHTML(extractTag(block, 'description') ?? extractTag(block, 'content') ?? extractTag(block, 'summary') ?? ''),
      pubDate:     extractTag(block, 'pubDate') ?? extractTag(block, 'published') ?? extractTag(block, 'updated') ?? '',
      location:    extractTag(block, 'location') ?? extractTag(block, 'region') ?? 'Remote',
      salary:      extractTag(block, 'salary') ?? extractTag(block, 'compensation') ?? '',
      category:    extractTag(block, 'category') ?? '',
      type:        extractTag(block, 'job_type') ?? extractTag(block, 'employment_type') ?? '',
    });
  }

  const jobs = items
    .filter((i) => i.title && i.link)
    .map((raw) => normalizeJob({
      title:       raw.title,
      company:     raw.company,
      description: raw.description,
      link:        raw.link,
      posted:      raw.pubDate,
      location:    raw.location,
      salary:      raw.salary,
      type:        raw.type,
    }, sourceUrl, 'rss'));

  return { jobs, total: jobs.length, method: 'rss' };
}

// ── JSON feeds (Remotive / Jobicy / WWR / generic Greenhouse exports) ──
export function parseJSONFeed(json: string, sourceUrl: string): ParsedFeed {
  try {
    const data = JSON.parse(json);
    let rawJobs: any[] = [];
    if (Array.isArray(data)) rawJobs = data;
    else if (data.jobs)      rawJobs = data.jobs;
    else if (data.data)      rawJobs = data.data;
    else if (data.results)   rawJobs = data.results;
    else if (data.positions) rawJobs = data.positions;
    else if (data.listings)  rawJobs = data.listings;

    // Remotive-specific
    if (data['job-count']) rawJobs = data.jobs ?? [];

    const jobs = rawJobs.slice(0, 100).map((raw: any) => normalizeJob({
      title:       raw.title ?? raw.position ?? raw.role ?? raw.job_title,
      company:     raw.company_name ?? raw.company ?? raw.employer ?? raw.organization,
      description: raw.description ?? raw.job_description ?? raw.content ?? raw.summary,
      link:        raw.url ?? raw.apply_url ?? raw.job_url ?? raw.link ?? raw.href,
      posted:      raw.publication_date ?? raw.date ?? raw.created_at ?? raw.posted_at ?? raw.pubDate,
      location:    raw.candidate_required_location ?? raw.location ?? raw.region ?? 'Remote',
      salary:      raw.salary ?? raw.salary_range ?? raw.compensation,
      type:        raw.job_type ?? raw.employment_type ?? raw.type,
      level:       raw.level ?? raw.seniority,
      logo:        raw.company_logo ?? raw.logo,
    }, sourceUrl, 'json-api'));

    return { jobs, total: jobs.length, method: 'json-api' };
  } catch (err: any) {
    return { jobs: [], total: 0, method: 'json-api', error: err.message };
  }
}

// Auto-detect format and dispatch. Returns `unknown` method when the
// body doesn't look like RSS, Atom, or JSON — callers should log + mark
// the source as `error` in job_sources rather than swallow.
export function parseFeed(body: string, contentType: string, sourceUrl: string): ParsedFeed {
  const ct = contentType.toLowerCase();
  const trimmed = body.trim();

  if (ct.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJSONFeed(body, sourceUrl);
  }
  if (body.includes('<rss') || body.includes('<feed') || body.includes('<channel')) {
    return parseXMLFeed(body, sourceUrl);
  }
  return { jobs: [], total: 0, method: 'unknown', error: 'Unrecognised feed format' };
}

// ── tag/attr extractors ────────────────────────────────────────────────
function extractTag(xml: string, tag: string): string | undefined {
  // Optional namespace prefix, so asking for `company` also matches
  // namespaced variants like WP Job Manager's <job_listing:company>.
  // Callers can still pass an explicit prefix ('dc:creator') verbatim.
  const t = `(?:[A-Za-z][\\w.-]*:)?${tag}`;
  const m =
    xml.match(new RegExp(`<${t}\\b[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${t}\\s*>`, 'i'))
    ?? xml.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}\\s*>`, 'i'));
  return m ? m[1].trim() : undefined;
}

// Map the camelCase Partial<Job> that parseXMLFeed/parseJSONFeed emit
// (via normalizeJob — the shape /api/rss preview consumers render) onto a
// snake_case public.jobs row for the ingest upsert. Drops the synthetic
// `ext_*` id so Postgres generates a real uuid, and nulls non-http(s)
// apply URLs the same way /api/ats/save does. Returns null when there is
// no usable apply URL — the pipeline can't dedupe or link such a row.
export function feedJobToDbRow(job: Record<string, any>, sourceUrl: string): Record<string, any> | null {
  const applyUrl = typeof job.applyUrl === 'string' && /^https?:\/\//i.test(job.applyUrl)
    ? job.applyUrl
    : null;
  if (!applyUrl) return null;
  const company = String(job.company ?? '').trim() || 'Unknown';
  return {
    title:       String(job.title ?? '').trim() || 'Untitled role',
    company,
    logo:        company[0]?.toUpperCase() ?? 'U',
    category:    job.category ?? 'other',
    type:        job.type ?? 'full-time',
    level:       job.level ?? null,
    location:    job.location || 'Worldwide',
    description: job.description ?? '',
    salary_min:  Number.isFinite(job.salaryMin) ? Math.round(job.salaryMin) : null,
    salary_max:  Number.isFinite(job.salaryMax) ? Math.round(job.salaryMax) : null,
    currency:    job.currency ?? 'USD',
    skills:      Array.isArray(job.skills) && job.skills.length ? job.skills : null,
    apply_url:   applyUrl,
    posted_at:   job.posted ?? new Date().toISOString(),
    source:      job.source ?? 'rss',
    source_url:  sourceUrl,
    remote:      true,
    featured:    false,
    is_new:      true,
    is_active:   true,
  };
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i'));
  return m ? m[1] : undefined;
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, STRIP_HTML_MAX);
}
