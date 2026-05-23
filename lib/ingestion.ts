// lib/ingestion.ts — Smart job ingestion: RSS → JSON API → Scrape fallback
import type { Job, JobCategory, JobType, JobLevel } from './types';
import { uid } from './utils';

export type IngestionMethod = 'rss' | 'json-api' | 'scrape' | 'unknown';

export interface IngestionResult {
  jobs: Partial<Job>[];
  method: IngestionMethod;
  total: number;
  error?: string;
  sourceUrl: string;
}

// ── Known RSS patterns ────────────────────────────────────────────────────
const RSS_PATTERNS = [
  /\.rss$/i, /\.xml$/i, /\/feed\/?(\?|$)/i,
  /\/rss\/?(\?|$)/i, /feed=job_feed/i, /\/atom\//i,
];
const JSON_API_PATTERNS = [
  /\/api\/v\d/i, /\.json(\?|$)/i, /\/jobs\.json/i,
];

// Known platform API endpoints
const KNOWN_APIS: Record<string, (url: string) => string> = {
  'remotive.com': () => 'https://remotive.com/api/remote-jobs?limit=50',
  'jobicy.com': () => 'https://jobicy.com/api/v2/remote-jobs?count=50',
  'weworkremotely.com': (url) => {
    const cat = url.includes('programming') ? 'remote-programming-jobs' : 'remote-jobs';
    return `https://weworkremotely.com/${cat}.rss`;
  },
  'remoteok.com': () => 'https://remoteok.com/remote-jobs.rss',
  'workingnomads.com': () => 'https://www.workingnomads.com/jobs?format=rss',
  'justremote.co': () => 'https://justremote.co/remote-developer-jobs.rss',
  'remote.co': () => 'https://remote.co/remote-jobs/feed/',
  'stackoverflow.com': () => 'https://stackoverflow.com/jobs/feed?r=true',
  'github.com/jobs': () => 'https://jobs.github.com/positions.json?utf8=%E2%9C%93&description=remote',
};

// ── Main detector ─────────────────────────────────────────────────────────
export async function detectAndFetch(url: string): Promise<IngestionResult> {
  const normalized = url.trim();

  // 1. Check known platforms first
  for (const [domain, apiFn] of Object.entries(KNOWN_APIS)) {
    if (normalized.includes(domain)) {
      const apiUrl = apiFn(normalized);
      const result = await tryFetchSource(apiUrl);
      if (result) return { ...result, sourceUrl: normalized };
    }
  }

  // 2. Check if it looks like RSS/XML
  if (RSS_PATTERNS.some((p) => p.test(normalized))) {
    const result = await tryRSS(normalized);
    if (result.jobs.length > 0) return { ...result, sourceUrl: normalized };
  }

  // 3. Check if it looks like a JSON API
  if (JSON_API_PATTERNS.some((p) => p.test(normalized))) {
    const result = await tryJSONApi(normalized);
    if (result.jobs.length > 0) return { ...result, sourceUrl: normalized };
  }

  // 4. Auto-detect: try RSS feed discovery on the domain
  const discovered = await discoverFeed(normalized);
  if (discovered) {
    const result = await tryFetchSource(discovered);
    if (result) return { ...result, sourceUrl: normalized };
  }

  // 5. Final fallback: scrape
  return await tryScrape(normalized);
}

async function tryFetchSource(url: string): Promise<IngestionResult | null> {
  if (url.endsWith('.rss') || url.includes('feed') || url.endsWith('.xml')) {
    const result = await tryRSS(url);
    if (result.jobs.length > 0) return result;
  }
  if (url.endsWith('.json') || url.includes('/api/')) {
    const result = await tryJSONApi(url);
    if (result.jobs.length > 0) return result;
  }
  return null;
}

// ── RSS Parser ────────────────────────────────────────────────────────────
export async function tryRSS(url: string): Promise<IngestionResult> {
  try {
    const res = await fetch(`/api/rss?url=${encodeURIComponent(url)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      jobs: data.jobs ?? [],
      method: 'rss',
      total: data.jobs?.length ?? 0,
      sourceUrl: url,
    };
  } catch (err: any) {
    return { jobs: [], method: 'rss', total: 0, error: err.message, sourceUrl: url };
  }
}

// ── JSON API ──────────────────────────────────────────────────────────────
export async function tryJSONApi(url: string): Promise<IngestionResult> {
  try {
    const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}&mode=json`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      jobs: data.jobs ?? [],
      method: 'json-api',
      total: data.jobs?.length ?? 0,
      sourceUrl: url,
    };
  } catch (err: any) {
    return { jobs: [], method: 'json-api', total: 0, error: err.message, sourceUrl: url };
  }
}

// ── Scrape ────────────────────────────────────────────────────────────────
export async function tryScrape(url: string): Promise<IngestionResult> {
  try {
    const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}&mode=html`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      jobs: data.jobs ?? [],
      method: 'scrape',
      total: data.jobs?.length ?? 0,
      error: data.error,
      sourceUrl: url,
    };
  } catch (err: any) {
    return { jobs: [], method: 'scrape', total: 0, error: err.message, sourceUrl: url };
  }
}

// ── Feed discovery (tries /feed, /rss, /jobs.rss etc.) ───────────────────
async function discoverFeed(url: string): Promise<string | null> {
  try {
    const base = new URL(url).origin;
    const candidates = [
      `${url.replace(/\/$/, '')}.rss`,
      `${base}/feed`,
      `${base}/jobs.rss`,
      `${base}/remote-jobs.rss`,
      `${base}/jobs/feed`,
    ];
    const checks = await Promise.allSettled(
      candidates.map((u) =>
        fetch(u, { method: 'HEAD' }).then((r) => (r.ok ? u : null))
      )
    );
    for (const c of checks) {
      if (c.status === 'fulfilled' && c.value) return c.value;
    }
  } catch {}
  return null;
}

// ── Normalize raw scraped/parsed job into our Job shape ───────────────────
export function normalizeJob(raw: Record<string, any>, sourceUrl: string, method: IngestionMethod): Partial<Job> {
  const title: string = raw.title ?? raw.position ?? raw.role ?? '';
  const company: string = raw.company ?? raw.organization ?? raw.employer ?? extractDomain(sourceUrl);
  const description: string = raw.description ?? raw.content ?? raw.summary ?? raw.snippet ?? '';
  const applyUrl: string = raw.applyUrl ?? raw.apply_url ?? raw.link ?? raw.url ?? raw.href ?? '';
  const location: string = raw.location ?? raw.region ?? 'Remote / Worldwide';
  const posted: string = raw.posted ?? raw.date ?? raw.pubDate ?? raw.publishedAt ?? new Date().toISOString();
  const salary = parseSalary(raw.salary ?? raw.compensation ?? raw.salaryRange ?? '');

  return {
    id: 'ext_' + uid(),
    title,
    company,
    description,
    applyUrl,
    location: location || 'Worldwide',
    posted: safeDate(posted),
    remote: true,
    featured: false,
    isNew: true,
    source: method === 'rss' ? 'rss' : method === 'json-api' ? 'api' : 'scrape',
    sourceUrl,
    category: guessCategory(title, description),
    type: guessType(title, description, raw.type ?? raw.jobType ?? ''),
    level: guessLevel(title, description, raw.level ?? raw.seniority ?? ''),
    skills: extractSkills(title + ' ' + description),
    ...salary,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '').replace('jobs.', ''); } catch { return url; }
}

function safeDate(raw: string): string {
  try { return new Date(raw).toISOString(); } catch { return new Date().toISOString(); }
}

function parseSalary(raw: string): { salaryMin?: number; salaryMax?: number; currency?: string } {
  if (!raw) return {};
  const nums = raw.replace(/,/g, '').match(/\d{2,6}k?/gi) ?? [];
  const parse = (s: string) => {
    const n = parseFloat(s);
    return s.toLowerCase().endsWith('k') ? n * 1000 : n;
  };
  const currency = raw.includes('€') ? 'EUR' : raw.includes('£') ? 'GBP' : 'USD';
  if (nums.length >= 2) return { salaryMin: parse(nums[0]!), salaryMax: parse(nums[1]!), currency };
  if (nums.length === 1) return { salaryMin: parse(nums[0]!), currency };
  return {};
}

function guessCategory(title: string, desc: string): JobCategory {
  const t = (title + ' ' + desc).toLowerCase();
  if (/engineer|developer|software|frontend|backend|fullstack|devops|sre|infrastructure|mobile|ios|android|cloud/.test(t)) return 'engineering';
  if (/design|ui\/ux|ux|figma|product design|graphic|visual/.test(t)) return 'design';
  if (/market|seo|content|growth|brand|social media|copywrite|demand gen/.test(t)) return 'marketing';
  if (/data|analyst|science|ml|machine learning|ai|analytics|bi|etl/.test(t)) return 'data';
  if (/finance|account|cfo|fp&a|controller|payroll|tax|audit/.test(t)) return 'finance';
  if (/sales|account exec|business dev|bdr|sdr|revenue/.test(t)) return 'sales';
  if (/hr|people|recruiting|talent|human resources/.test(t)) return 'hr';
  if (/product manager|pm |product lead|roadmap/.test(t)) return 'product';
  if (/legal|counsel|compliance|attorney|law/.test(t)) return 'legal';
  if (/ops|operations|supply chain|logistics|support/.test(t)) return 'operations';
  return 'other';
}

function guessType(title: string, desc: string, raw: string): JobType {
  const t = (title + ' ' + desc + ' ' + raw).toLowerCase();
  if (/part.?time/.test(t)) return 'part-time';
  if (/contract|freelance|consultant/.test(t)) return 'contract';
  if (/freelance/.test(t)) return 'freelance';
  return 'full-time';
}

function guessLevel(title: string, desc: string, raw: string): JobLevel {
  const t = (title + ' ' + desc + ' ' + raw).toLowerCase();
  if (/chief|vp |vice president|c-level|cto|ceo|cmo|coo/.test(t)) return 'executive';
  if (/lead |principal|staff |architect/.test(t)) return 'lead';
  if (/senior|sr\.|sr |iii/.test(t)) return 'senior';
  if (/junior|jr\.|jr |entry|associate|intern|graduate|early career/.test(t)) return 'entry';
  return 'mid';
}

const SKILL_KEYWORDS = [
  'React','Vue','Angular','Next.js','TypeScript','JavaScript','Python','Go','Rust','Java','Kotlin','Swift',
  'Node.js','Django','Rails','Laravel','Spring','Docker','Kubernetes','AWS','GCP','Azure','Terraform',
  'PostgreSQL','MySQL','MongoDB','Redis','GraphQL','REST','Figma','Sketch','SQL','Spark','Airflow','dbt',
  'Salesforce','HubSpot','Jira','Slack','Git','CI/CD','TDD','Agile','Scrum','AI','ML','LLM','PyTorch',
  'TensorFlow','NLP','Tableau','Power BI','Excel','SAP','QuickBooks',
];

function extractSkills(text: string): string[] {
  return SKILL_KEYWORDS.filter(k => lower.includes(k.toLowerCase()));
}
