// app/api/rss/route.ts — Server-side RSS fetcher & parser
import { NextRequest, NextResponse } from 'next/server';
import { normalizeJob } from '@/lib/ingestion';

export const runtime = 'edge';
export const revalidate = 300; // 5 minutes

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  try {
    // Fetch the RSS/XML with a browser-like UA
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44/1.0; +https://remotejobs44.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream error: ${res.status}`, jobs: [] }, { status: 200 });
    }

    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();

    // Auto-detect format
    if (contentType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      return NextResponse.json(parseJSONFeed(text, url));
    }

    if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
      return NextResponse.json(parseXMLFeed(text, url));
    }

    return NextResponse.json({ error: 'Unrecognised feed format', jobs: [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, jobs: [] }, { status: 200 });
  }
}

// ── XML/RSS Parser (pure string parsing — no DOM dependencies for edge) ───
function parseXMLFeed(xml: string, sourceUrl: string) {
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  const items: Record<string, string>[] = [];

  const itemTag = isAtom ? 'entry' : 'item';
  const itemRegex = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, 'gi');
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title') ?? extractTag(block, 'a10:title') ?? '',
      link: extractTag(block, 'link') ?? extractAttr(block, 'link', 'href') ?? '',
      company: extractTag(block, 'company') ?? extractTag(block, 'author') ?? extractTag(block, 'dc:creator') ?? '',
      description: stripHTML(extractTag(block, 'description') ?? extractTag(block, 'content') ?? extractTag(block, 'summary') ?? ''),
      pubDate: extractTag(block, 'pubDate') ?? extractTag(block, 'published') ?? extractTag(block, 'updated') ?? '',
      location: extractTag(block, 'location') ?? extractTag(block, 'region') ?? 'Remote',
      salary: extractTag(block, 'salary') ?? extractTag(block, 'compensation') ?? '',
      category: extractTag(block, 'category') ?? '',
    });
  }

  const jobs = items
    .filter((i) => i.title && i.link)
    .map((raw) => normalizeJob({
      title: raw.title,
      company: raw.company,
      description: raw.description,
      link: raw.link,
      posted: raw.pubDate,
      location: raw.location,
      salary: raw.salary,
    }, sourceUrl, 'rss'));

  return { jobs, total: jobs.length, method: 'rss' };
}

// ── JSON Feed Parser (handles Remotive, Jobicy, WWR, etc.) ────────────────
function parseJSONFeed(json: string, sourceUrl: string) {
  try {
    const data = JSON.parse(json);

    // Detect format
    let rawJobs: any[] = [];
    if (Array.isArray(data)) rawJobs = data;
    else if (data.jobs) rawJobs = data.jobs;
    else if (data.data) rawJobs = data.data;
    else if (data.results) rawJobs = data.results;
    else if (data.positions) rawJobs = data.positions;
    else if (data.listings) rawJobs = data.listings;

    // Remotive-specific
    if (data['job-count']) rawJobs = data.jobs ?? [];

    const jobs = rawJobs.slice(0, 100).map((raw: any) => normalizeJob({
      title: raw.title ?? raw.position ?? raw.role ?? raw.job_title,
      company: raw.company_name ?? raw.company ?? raw.employer ?? raw.organization,
      description: raw.description ?? raw.job_description ?? raw.content ?? raw.summary,
      link: raw.url ?? raw.apply_url ?? raw.job_url ?? raw.link ?? raw.href,
      posted: raw.publication_date ?? raw.date ?? raw.created_at ?? raw.posted_at ?? raw.pubDate,
      location: raw.candidate_required_location ?? raw.location ?? raw.region ?? 'Remote',
      salary: raw.salary ?? raw.salary_range ?? raw.compensation,
      type: raw.job_type ?? raw.employment_type ?? raw.type,
      level: raw.level ?? raw.seniority,
      logo: raw.company_logo ?? raw.logo,
    }, sourceUrl, 'json-api'));

    return { jobs, total: jobs.length, method: 'json-api' };
  } catch (err: any) {
    return { jobs: [], total: 0, error: err.message, method: 'json-api' };
  }
}

// ── XML helpers ───────────────────────────────────────────────────────────
function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
    ?? xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : undefined;
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i'));
  return m ? m[1] : undefined;
}
