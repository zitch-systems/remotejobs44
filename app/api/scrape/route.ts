// app/api/scrape/route.ts — Career page scraper for bulk import (GET + POST)
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const revalidate = 300;

const ATS_PATTERNS: Record<string, string> = {
  'greenhouse.io':       'Greenhouse',
  'lever.co':            'Lever',
  'ashbyhq.com':         'Ashby',
  'workable.com':        'Workable',
  'bamboohr.com':        'BambooHR',
  'myworkdayjobs.com':   'Workday',
  'icims.com':           'iCIMS',
  'taleo.net':           'Taleo',
  'smartrecruiters.com': 'SmartRecruiters',
  'rippling.com':        'Rippling',
  'recruitee.com':       'Recruitee',
  'personio.de':         'Personio',
  'breezy.hr':           'Breezy HR',
  'jobvite.com':         'Jobvite',
};

function detectATS(url: string): string {
  const lower = url.toLowerCase();
  for (const [pattern, name] of Object.entries(ATS_PATTERNS)) {
    if (lower.includes(pattern)) return name;
  }
  return 'Custom';
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    // boards.greenhouse.io/company → company
    if (hostname.includes('greenhouse.io') || hostname.includes('lever.co')) {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length > 0) return parts[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return hostname.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Unknown';
  }
}

// Shared scrape logic used by both GET and POST
async function scrapeUrl(url: string) {
  const ats     = detectATS(url);
  const company = extractCompanyName(url);
  const jobs: { title: string; company: string; location: string; applyUrl?: string }[] = [];
  let fetchError: string | null = null;
  let requiresJS = false;
  let method = 'scrape';

  // Detect known JS-only ATS platforms
  const jsOnlyPlatforms = ['myworkdayjobs.com', 'taleo.net', 'icims.com', 'smartrecruiters.com'];
  if (jsOnlyPlatforms.some(p => url.toLowerCase().includes(p))) {
    requiresJS = true;
    return { company, ats, jobs: [], method: 'scrape', requiresJS, detectedPlatform: ats, suggestion: `Use the ${ats} API instead`, jobsFound: 0, total: 0 };
  }

  // Greenhouse boards API — convert to API URL
  if (url.includes('greenhouse.io')) {
    try {
      const ghCompany = new URL(url).pathname.split('/').filter(Boolean)[0];
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${ghCompany}/jobs?content=true`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'RemoteJobs44Bot/1.0' } });
      if (res.ok) {
        const data = await res.json();
        const rawJobs = data.jobs ?? [];
        rawJobs.slice(0, 20).forEach((j: any) => {
          jobs.push({ title: j.title, company: ghCompany.replace(/-/g, ' '), location: j.location?.name ?? 'Remote', applyUrl: j.absolute_url });
        });
        return { company, ats: 'Greenhouse', jobs, method: 'greenhouse-api', requiresJS: false, jobsFound: rawJobs.length, total: rawJobs.length };
      }
    } catch {}
  }

  // Lever API
  if (url.includes('lever.co')) {
    try {
      const leverCompany = new URL(url).pathname.split('/').filter(Boolean)[0];
      const apiUrl = `https://api.lever.co/v0/postings/${leverCompany}?mode=json`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'RemoteJobs44Bot/1.0' } });
      if (res.ok) {
        const rawJobs = await res.json();
        rawJobs.slice(0, 20).forEach((j: any) => {
          jobs.push({ title: j.text, company: leverCompany.replace(/-/g, ' '), location: j.categories?.location ?? 'Remote', applyUrl: j.hostedUrl });
        });
        return { company, ats: 'Lever', jobs, method: 'lever-api', requiresJS: false, jobsFound: rawJobs.length, total: rawJobs.length };
      }
    } catch {}
  }

  // Ashby API
  if (url.includes('ashbyhq.com')) {
    try {
      const ashbyCompany = new URL(url).pathname.split('/').filter(Boolean)[0];
      const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${ashbyCompany}`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'RemoteJobs44Bot/1.0', 'Content-Type': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const rawJobs = data.jobs ?? [];
        rawJobs.slice(0, 20).forEach((j: any) => {
          jobs.push({ title: j.title, company: ashbyCompany.replace(/-/g, ' '), location: j.isRemote ? 'Remote' : j.location ?? 'Remote', applyUrl: j.jobUrl });
        });
        return { company, ats: 'Ashby', jobs, method: 'ashby-api', requiresJS: false, jobsFound: rawJobs.length, total: rawJobs.length };
      }
    } catch {}
  }

  // Fallback: HTML scrape
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44Bot/1.0)', 'Accept': 'text/html,application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // Try JSON embedded in page
    const jsonMatch = text.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i)
      ?? text.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/i);
    if (jsonMatch) {
      try {
        const embedded = JSON.parse(jsonMatch[1]);
        const rawJobs = embedded.jobs ?? embedded.positions ?? embedded.listings ?? [];
        rawJobs.slice(0, 20).forEach((j: any) => {
          jobs.push({ title: j.title ?? j.name, company: j.company ?? company, location: j.location ?? 'Remote', applyUrl: j.url ?? j.applyUrl });
        });
        if (jobs.length > 0) return { company, ats, jobs, method: 'scrape', requiresJS: false, jobsFound: jobs.length, total: jobs.length };
      } catch {}
    }

    // Extract jobs from HTML structure heuristically
    const titleMatches = [...text.matchAll(/<(?:h[1-4]|a)[^>]*class="[^"]*(?:job|position|role|title)[^"]*"[^>]*>([^<]{5,100})<\//gi)];
    titleMatches.slice(0, 20).forEach(m => {
      jobs.push({ title: m[1].trim(), company, location: 'Remote' });
    });

    // Count patterns as a fallback metric
    const countPatterns = [/job[-_]?listing/gi, /data-job/gi, /job-card/gi, /"title"\s*:/gi];
    let matches = 0;
    for (const p of countPatterns) matches += (text.match(p) ?? []).length;
    const jobsFound = jobs.length > 0 ? jobs.length : Math.min(Math.floor(matches / 2), 999);

    return { company, ats, jobs, method: 'scrape', requiresJS: false, jobsFound, total: jobsFound };

  } catch (err: any) {
    fetchError = err.message;
    return { company, ats, jobs: [], method: 'scrape', requiresJS: false, error: fetchError, jobsFound: 0, total: 0 };
  }
}

// GET handler — used by admin sources page: /api/scrape?url=...&mode=auto
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
  const result = await scrapeUrl(url);
  return NextResponse.json(result);
}

// POST handler — kept for backwards compat
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });
    const result = await scrapeUrl(url);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
