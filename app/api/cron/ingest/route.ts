// app/api/cron/ingest/route.ts — Vercel Cron Job, runs every 6 hours
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const CRON_SECRET    = process.env.CRON_SECRET ?? '';
const FINDWORK_KEY   = process.env.FINDWORK_API_KEY ?? '';
const SERP_KEY       = process.env.SERPAPI_KEY ?? '';
const CRON_MIN_LEN   = 16;

type RawJob = Record<string, any>;
interface Source {
  name: string;
  fetch: () => Promise<RawJob[]>;
  normalise: (j: RawJob) => Record<string, any> | null;
}

const SOURCES: Source[] = [

  // Remotive
  {
    name: 'Remotive',
    fetch: async () => {
      const r = await fetch('https://remotive.com/api/remote-jobs?limit=50', { signal: AbortSignal.timeout(15000) });
      return (await r.json()).jobs ?? [];
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

  // Jobicy
  {
    name: 'Jobicy',
    fetch: async () => {
      const r = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50', { signal: AbortSignal.timeout(15000) });
      return (await r.json()).jobs ?? [];
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

  // RemoteOK
  {
    name: 'RemoteOK',
    fetch: async () => {
      const r = await fetch('https://remoteok.com/api', {
        headers: { 'User-Agent': 'RemoteJobs44/1.0 (hello@remotejobs44.com)' },
        signal: AbortSignal.timeout(15000),
      });
      const d = await r.json();
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

  // Arbeitnow
  {
    name: 'Arbeitnow',
    fetch: async () => {
      const r = await fetch('https://www.arbeitnow.com/api/job-board-api', { signal: AbortSignal.timeout(15000) });
      return (await r.json()).data ?? [];
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

  // Findwork.dev (requires FINDWORK_API_KEY)
  ...(FINDWORK_KEY ? [{
    name: 'Findwork',
    fetch: async (): Promise<RawJob[]> => {
      const r = await fetch('https://findwork.dev/api/jobs/?sort_by=date', {
        headers: { Authorization: `Token ${FINDWORK_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      return (await r.json()).results ?? [];
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
  }] : []),

  // SerpApi — Google Jobs (requires SERPAPI_KEY)
  ...(SERP_KEY ? [
    ...['remote software engineer', 'remote designer', 'remote marketing', 'remote product manager'].map(query => ({
      name: `SerpApi:${query.replace('remote ', '')}`,
      fetch: async (): Promise<RawJob[]> => {
        const url = new URL('https://serpapi.com/search.json');
        url.searchParams.set('engine', 'google_jobs');
        url.searchParams.set('q', query);
        url.searchParams.set('ltype', '1');
        url.searchParams.set('num', '10');
        url.searchParams.set('api_key', SERP_KEY);
        const r = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
        return (await r.json()).jobs_results ?? [];
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
    }))
  ] : []),
];

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!CRON_SECRET || CRON_SECRET.length < CRON_MIN_LEN) {
    console.error('[cron/ingest] CRON_SECRET not set or too short');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 });
  }
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const results: Record<string, number | string> = {};
  let totalAdded = 0;

  for (const source of SOURCES) {
    try {
      const raw = await source.fetch();
      const jobs = raw.slice(0, 50)
        .map(source.normalise)
        .filter((j): j is Record<string, any> => !!j && !!j.apply_url);

      if (!jobs.length) { results[source.name] = 0; continue; }

      const { data: inserted } = await supabase
        .from('jobs')
        .upsert(jobs, { onConflict: 'apply_url', ignoreDuplicates: true })
        .select('id');

      results[source.name] = inserted?.length ?? 0;
      totalAdded += inserted?.length ?? 0;
    } catch (err: any) {
      console.error(`Ingest ${source.name}:`, err.message);
      results[source.name] = `error: ${err.message}`;
    }
  }

  return NextResponse.json({ success: true, totalAdded, results, at: new Date().toISOString() });
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
