// lib/ats-engine.ts — ATS detection + public API fetching for 5 platforms
// All endpoints are FREE with no authentication required
import type { Job } from './types';
import { uid } from './utils';

export type ATSPlatform = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee' | 'unknown';

export interface ATSDetectResult {
  platform: ATSPlatform;
  slug: string;           // company slug/identifier on the ATS
  apiEndpoint: string;    // direct API URL
  confidence: 'high' | 'medium' | 'low';
}

export interface ATSFetchResult {
  jobs: Partial<Job>[];
  total: number;
  platform: ATSPlatform;
  slug: string;
  error?: string;
}

// ── ATS slug patterns ────────────────────────────────────────────────────
const ATS_URL_PATTERNS: Array<{
  platform: ATSPlatform;
  regex: RegExp;
  extractSlug: (match: RegExpMatchArray) => string;
  buildApi: (slug: string) => string;
}> = [
  // Greenhouse: boards.greenhouse.io/company OR boards-api.greenhouse.io...
  {
    platform: 'greenhouse',
    regex: /boards\.greenhouse\.io\/([a-z0-9_-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
  },
  // Lever: jobs.lever.co/company
  {
    platform: 'lever',
    regex: /jobs\.lever\.co\/([a-z0-9_-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://api.lever.co/v0/postings/${slug}?mode=json`,
  },
  // Ashby: jobs.ashbyhq.com/company
  {
    platform: 'ashby',
    regex: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
  },
  // Workable: apply.workable.com/company OR company.workable.com
  {
    platform: 'workable',
    regex: /(?:apply\.workable\.com|([a-z0-9-]+)\.workable\.com)/i,
    extractSlug: m => m[1] || m[0].split('.')[0],
    buildApi: slug => `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
  },
  // Recruitee: company.recruitee.com
  {
    platform: 'recruitee',
    regex: /([a-z0-9-]+)\.recruitee\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.recruitee.com/api/offers`,
  },
];

// ── Detect ATS from a URL ─────────────────────────────────────────────────
export function detectATSFromUrl(url: string): ATSDetectResult | null {
  for (const p of ATS_URL_PATTERNS) {
    const m = url.match(p.regex);
    if (m) {
      const slug = p.extractSlug(m);
      return {
        platform: p.platform,
        slug,
        apiEndpoint: p.buildApi(slug),
        confidence: 'high',
      };
    }
  }
  return null;
}

// ── Detect ATS from page HTML ─────────────────────────────────────────────
export function detectATSFromHtml(html: string, pageUrl: string): ATSDetectResult | null {
  const lower = html.toLowerCase();

  for (const p of ATS_URL_PATTERNS) {
    const m = html.match(p.regex);
    if (m) {
      const slug = p.extractSlug(m);
      return {
        platform: p.platform,
        slug,
        apiEndpoint: p.buildApi(slug),
        confidence: 'medium',
      };
    }
  }

  // Try to detect from meta tags or script src
  const scriptMatches = [...html.matchAll(/src="([^"]+)"/gi)].map(m => m[1]);
  for (const src of scriptMatches) {
    const r = detectATSFromUrl(src);
    if (r) return { ...r, confidence: 'low' };
  }

  return null;
}

// ── Guess ATS slug from company name / domain ────────────────────────────
export function guessATSSlugs(companyName: string, domain?: string): Record<ATSPlatform, string[]> {
  const name = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameDash = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const domainSlug = domain ? new URL(domain.startsWith('http') ? domain : 'https://' + domain).hostname.replace('www.', '').split('.')[0] : null;

  const candidates = [...new Set([name, nameDash, domainSlug].filter(Boolean))] as string[];

  return {
    greenhouse: candidates,
    lever: candidates,
    ashby: candidates,
    workable: candidates,
    recruitee: candidates,
    unknown: [],
  };
}

// ── Fetch jobs from any ATS ──────────────────────────────────────────────
export async function fetchATSJobs(platform: ATSPlatform, slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  try {
    switch (platform) {
      case 'greenhouse': return await fetchGreenhouse(slug, sourceUrl);
      case 'lever':      return await fetchLever(slug, sourceUrl);
      case 'ashby':      return await fetchAshby(slug, sourceUrl);
      case 'workable':   return await fetchWorkable(slug, sourceUrl);
      case 'recruitee':  return await fetchRecruitee(slug, sourceUrl);
      default:           return { jobs: [], total: 0, platform, slug, error: 'Unknown platform' };
    }
  } catch (err: any) {
    return { jobs: [], total: 0, platform, slug, error: err.message };
  }
}

// ── Greenhouse ─────────────────────────────────────────────────────────────
async function fetchGreenhouse(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Greenhouse ${res.status}: ${slug} not found`);
  const data = await res.json();
  const jobs: Partial<Job>[] = (data.jobs ?? []).map((j: any) => ({
    id: `gh_${j.id}`,
    title: j.title,
    company: data.company?.name ?? slug,
    description: stripHtml(j.content ?? ''),
    applyUrl: j.absolute_url,
    location: j.location?.name ?? 'Remote',
    posted: j.updated_at ?? new Date().toISOString(),
    remote: /remote/i.test(j.location?.name ?? ''),
    type: 'full-time',
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.content ?? ''),
    skills: extractSkills(j.title + ' ' + (j.content ?? '')),
    source: 'api',
    sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'greenhouse', slug };
}

// ── Lever ──────────────────────────────────────────────────────────────────
async function fetchLever(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Lever ${res.status}: ${slug} not found`);
  const data = await res.json();
  const postings = Array.isArray(data) ? data : data.postings ?? [];
  const jobs: Partial<Job>[] = postings.map((j: any) => ({
    id: `lv_${j.id}`,
    title: j.text,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.description ?? j.descriptionPlain ?? ''),
    applyUrl: j.hostedUrl,
    location: j.categories?.location ?? j.workplaceType ?? 'Remote',
    posted: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
    remote: /remote/i.test(j.categories?.location ?? j.workplaceType ?? ''),
    type: mapLeverType(j.categories?.commitment),
    level: guessLevel(j.text),
    category: guessCategory(j.text, j.description ?? ''),
    skills: extractSkills(j.text + ' ' + (j.description ?? '')),
    source: 'api',
    sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'lever', slug };
}

// ── Ashby ──────────────────────────────────────────────────────────────────
async function fetchAshby(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Ashby ${res.status}: ${slug} not found`);
  const data = await res.json();
  const postings = data.jobPostings ?? [];
  const jobs: Partial<Job>[] = postings.map((j: any) => ({
    id: `ash_${j.id ?? uid()}`,
    title: j.title,
    company: data.organization?.name ?? slug,
    description: stripHtml(j.descriptionHtml ?? j.description ?? ''),
    applyUrl: j.jobUrl ?? j.applyUrl,
    location: j.isRemote ? 'Remote' : (j.locationName ?? 'Unknown'),
    posted: j.publishedDate ?? new Date().toISOString(),
    remote: j.isRemote ?? false,
    type: 'full-time',
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.description ?? ''),
    skills: extractSkills(j.title + ' ' + (j.description ?? '')),
    salaryMin: j.compensation?.minValue ?? undefined,
    salaryMax: j.compensation?.maxValue ?? undefined,
    currency: j.compensation?.currency ?? 'USD',
    source: 'api',
    sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'ashby', slug };
}

// ── Workable ───────────────────────────────────────────────────────────────
async function fetchWorkable(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${slug}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Workable ${res.status}: ${slug} not found`);
  const data = await res.json();
  const positions = data.jobs ?? [];
  const jobs: Partial<Job>[] = positions.map((j: any) => ({
    id: `wk_${j.shortcode ?? uid()}`,
    title: j.title,
    company: data.name ?? slug,
    description: stripHtml(j.description ?? ''),
    applyUrl: `https://apply.workable.com/${slug}/j/${j.shortcode}`,
    location: j.location ?? j.city ?? 'Remote',
    posted: j.published_on ?? new Date().toISOString(),
    remote: j.telecommuting ?? /remote/i.test(j.location ?? ''),
    type: mapWorkableType(j.employment_type),
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.description ?? ''),
    skills: extractSkills(j.title + ' ' + (j.description ?? '')),
    source: 'api',
    sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'workable', slug };
}

// ── Recruitee ──────────────────────────────────────────────────────────────
async function fetchRecruitee(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.recruitee.com/api/offers`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Recruitee ${res.status}: ${slug} not found`);
  const data = await res.json();
  const offers = data.offers ?? [];
  const jobs: Partial<Job>[] = offers.map((j: any) => ({
    id: `rt_${j.id}`,
    title: j.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.description ?? ''),
    applyUrl: j.careers_url,
    location: j.location ?? j.city ?? 'Remote',
    posted: j.published_at ?? new Date().toISOString(),
    remote: /remote/i.test(j.location ?? j.tags?.join(' ') ?? ''),
    type: 'full-time',
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.description ?? ''),
    skills: extractSkills(j.title + ' ' + (j.description ?? '')),
    source: 'api',
    sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'recruitee', slug };
}

// ── Auto-detect and fetch from any career page URL ────────────────────────
export async function autoFetchFromCareerUrl(url: string): Promise<ATSFetchResult & { detected: ATSDetectResult | null }> {
  // 1. Try to detect ATS directly from the URL
  const directDetect = detectATSFromUrl(url);
  if (directDetect) {
    const result = await fetchATSJobs(directDetect.platform, directDetect.slug, url);
    return { ...result, detected: directDetect };
  }

  // 2. Fetch the page and inspect HTML for ATS links
  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const htmlDetect = detectATSFromHtml(html, url);
      if (htmlDetect) {
        const result = await fetchATSJobs(htmlDetect.platform, htmlDetect.slug, url);
        return { ...result, detected: htmlDetect };
      }
    }
  } catch {}

  return { jobs: [], total: 0, platform: 'unknown', slug: '', detected: null, error: 'Could not detect ATS from this URL' };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

function mapLeverType(commitment?: string): any {
  if (!commitment) return 'full-time';
  const c = commitment.toLowerCase();
  if (c.includes('part')) return 'part-time';
  if (c.includes('contract') || c.includes('freelance')) return 'contract';
  return 'full-time';
}

function mapWorkableType(type?: string): any {
  if (!type) return 'full-time';
  const t = type.toLowerCase();
  if (t.includes('part')) return 'part-time';
  if (t.includes('contract') || t.includes('temp')) return 'contract';
  if (t.includes('intern')) return 'entry';
  return 'full-time';
}

function guessLevel(title: string): string {
  const t = title.toLowerCase();
  if (/staff|principal|architect/.test(t)) return 'lead';
  if (/senior|sr\.?|sr /.test(t)) return 'senior';
  if (/junior|jr\.?|entry|associate|intern|graduate/.test(t)) return 'entry';
  if (/vp|vice president|director|head of|chief|cto|ceo/.test(t)) return 'executive';
  return 'mid';
}

function guessCategory(title: string, desc: string): string {
  const t = (title + ' ' + desc).toLowerCase();
  if (/engineer|developer|software|frontend|backend|fullstack|devops|mobile|ios|android|cloud|sre|infra|platform/.test(t)) return 'engineering';
  if (/design|ux|ui|figma|product design|visual|graphic/.test(t)) return 'design';
  if (/market|seo|content|growth|brand|social|demand gen|copywrite/.test(t)) return 'marketing';
  if (/data|scientist|analytics|ml|machine learning|ai|nlp|bi |etl/.test(t)) return 'data';
  if (/finance|account|fp&a|cfo|controller|payroll|tax/.test(t)) return 'finance';
  if (/sales|account exec|bdr|sdr|revenue|business dev/.test(t)) return 'sales';
  if (/hr|people|recruit|talent|human resources/.test(t)) return 'hr';
  if (/product manager|pm |product lead|roadmap/.test(t)) return 'product';
  if (/legal|counsel|compliance|attorney/.test(t)) return 'legal';
  if (/ops|operations|support|supply chain/.test(t)) return 'operations';
  return 'other';
}

const SKILLS = ['React','Vue','Angular','Next.js','TypeScript','JavaScript','Python','Go','Rust','Java','Kotlin','Swift','Node.js','Django','Rails','Docker','Kubernetes','AWS','GCP','Azure','Terraform','PostgreSQL','MySQL','MongoDB','Redis','GraphQL','REST','Figma','SQL','Spark','Airflow','dbt','Salesforce','HubSpot','Git','CI/CD','PyTorch','TensorFlow','NLP','Tableau','Power BI','Excel','Stripe','Twilio'];
function extractSkills(text: string): string[] {
  return SKILLS.filter(s => new RegExp(`\\b${s.replace('.','\\.')}\\b`, 'i').test(text)).slice(0, 8);
}
