// app/api/scrape/route.ts — Smart scraper: JSON API → HTML → JS-site detection (Consider removed)
import { NextRequest, NextResponse } from 'next/server';
import { normalizeJob } from '@/lib/ingestion';

export const runtime = 'nodejs';
export const revalidate = 300;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function GET(req: NextRequest) {
  const url  = req.nextUrl.searchParams.get('url');
  const mode = req.nextUrl.searchParams.get('mode') ?? 'auto';

  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  try {
    if (mode === 'json') {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}`, jobs: [] });
      const data = await res.json();
      return NextResponse.json(parseJSONResponse(data, url));
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}`, jobs: [] });
    const html = await res.text();

    if (detectJSSite(html)) {
      const atsResult = await tryATSApis(url, html);
      if (atsResult && atsResult.jobs.length > 0) return NextResponse.json(atsResult);
      return NextResponse.json({
        jobs: [], method: 'scrape', total: 0, requiresJS: true,
        detectedPlatform: detectPlatform(html, url),
        suggestion: getSuggestion(html, url),
      });
    }

    const jobs = parseHTMLJobs(html, url);
    return NextResponse.json({ jobs, total: jobs.length, method: 'scrape' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, jobs: [] }, { status: 200 });
  }
}

function detectJSSite(html: string): boolean {
  const scriptCount = (html.match(/<script/gi) ?? []).length;
  const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  const spaMarkers = ['__next','nuxt','ng-app','data-reactroot','window.__data','window.__INITIAL_STATE__','__vue','workday','greenhouse.io','lever.co','ashbyhq.com','jobvite','smartrecruiters','taleo','icims','breezyhr','getro.com'];
  return (scriptCount > 5 && bodyText < 2000) || spaMarkers.some(m => html.toLowerCase().includes(m));
}

function detectPlatform(html: string, url: string): string {
  const h = html.toLowerCase();
  if (h.includes('greenhouse.io') || url.includes('greenhouse')) return 'Greenhouse ATS';
  if (h.includes('lever.co') || url.includes('lever')) return 'Lever ATS';
  if (h.includes('ashbyhq.com') || url.includes('ashby')) return 'Ashby ATS';
  if (h.includes('workday')) return 'Workday ATS';
  if (h.includes('getro.com')) return 'Getro';
  return 'JavaScript SPA';
}

function getSuggestion(html: string, url: string): string {
  const platform = detectPlatform(html, url);
  if (platform.includes('Greenhouse')) return 'Try: boards-api.greenhouse.io/v1/boards/SLUG/jobs';
  if (platform.includes('Lever')) return 'Try: api.lever.co/v0/postings/SLUG?mode=json';
  if (platform.includes('Ashby')) return 'Try: api.ashbyhq.com/posting-api/job-board/SLUG';
  if (platform === 'Getro') return 'Getro is a paid JS platform. Add individual company Greenhouse/Lever/Ashby URLs instead.';
  return 'Try finding an RSS feed or direct API endpoint.';
}

async function tryATSApis(pageUrl: string, html: string): Promise<{ jobs: any[]; method: string; total: number } | null> {
  const ghMatch = html.match(/boards\.greenhouse\.io\/([a-z0-9_-]+)/i);
  if (ghMatch) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs?content=true`);
      if (r.ok) {
        const data = await r.json();
        const jobs = (data.jobs ?? []).slice(0, 50).map((j: any) => normalizeJob({ title: j.title, company: data.company?.name ?? ghMatch[1], description: j.content ?? '', link: j.absolute_url, posted: j.updated_at, location: j.location?.name ?? 'Remote' }, pageUrl, 'json-api'));
        return { jobs, method: 'greenhouse-api', total: jobs.length };
      }
    } catch {}
  }
  const levMatch = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (levMatch) {
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${levMatch[1]}?mode=json`);
      if (r.ok) {
        const data = await r.json();
        const jobs = (Array.isArray(data) ? data : []).slice(0, 50).map((j: any) => normalizeJob({ title: j.text, company: levMatch[1], description: j.description ?? '', link: j.hostedUrl, posted: new Date(j.createdAt).toISOString(), location: j.categories?.location ?? 'Remote' }, pageUrl, 'json-api'));
        return { jobs, method: 'lever-api', total: jobs.length };
      }
    } catch {}
  }
  const ashbyMatch = html.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i);
  if (ashbyMatch) {
    try {
      const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}`);
      if (r.ok) {
        const data = await r.json();
        const jobs = (data.jobPostings ?? []).slice(0, 50).map((j: any) => normalizeJob({ title: j.title, company: ashbyMatch[1], description: j.descriptionHtml ?? '', link: j.jobUrl, posted: j.publishedDate, location: j.isRemote ? 'Remote' : (j.locationName ?? 'Remote') }, pageUrl, 'json-api'));
        return { jobs, method: 'ashby-api', total: jobs.length };
      }
    } catch {}
  }
  return null;
}

function parseJSONResponse(data: any, sourceUrl: string) {
  let rawJobs: any[] = [];
  if (Array.isArray(data)) rawJobs = data;
  else if (data.jobs) rawJobs = data.jobs;
  else if (data.results) rawJobs = data.results;
  else if (data.data?.jobs) rawJobs = data.data.jobs;
  else if (data.positions) rawJobs = data.positions;
  const jobs = rawJobs.slice(0, 100).map((raw: any) => normalizeJob({ title: raw.title ?? raw.position, company: raw.company_name ?? raw.company, description: raw.description ?? raw.content, link: raw.url ?? raw.apply_url ?? raw.link, posted: raw.publication_date ?? raw.date ?? raw.created_at, location: raw.candidate_required_location ?? raw.location ?? 'Remote' }, sourceUrl, 'json-api'));
  return { jobs, total: jobs.length, method: 'json-api' };
}

function parseHTMLJobs(html: string, sourceUrl: string): any[] {
  const jobs: any[] = [];
  const jsonLdRegex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const schema = JSON.parse(m[1]);
      const postings = Array.isArray(schema) ? schema : [schema];
      for (const p of postings) {
        if (p['@type'] === 'JobPosting') {
          jobs.push(normalizeJob({ title: p.title, company: p.hiringOrganization?.name, description: p.description, link: p.url ?? p.sameAs, posted: p.datePosted, location: p.jobLocation?.address?.addressLocality ?? 'Remote', type: p.employmentType }, sourceUrl, 'scrape'));
        }
      }
    } catch {}
  }
  return jobs.slice(0, 100);
}
