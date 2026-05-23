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
  // Workable: apply.workable.com/company
  {
    platform: 'workable',
    regex: /apply\.workable\.com\/([a-z0-9_-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
  },
  // Workable: company.workable.com
  {
    platform: 'workable',
    regex: /([a-z0-9-]+)\.workable\.com/i,
    extractSlug: m => m[1],
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
  // Check the job TITLE first — it's the strongest signal.
  // Broad keywords like "platform" or "cloud" only count when the title itself
  // points to an engineering role (e.g. "Platform Engineer", "Cloud Architect").
  const t = title.toLowerCase();
  const td = (title + ' ' + desc).toLowerCase();

  // Non-engineering signals — check these BEFORE engineering so e.g.
  // "Marketing Automation Platform Manager" doesn't become 'engineering'.
  if (/\b(product manager|product lead|product owner|head of product|vp product|director of product|chief product)\b/.test(t)) return 'product';
  if (/\b(marketing|growth hacker|seo|sem|content writer|copywriter|brand manager|demand gen|social media|community manager|email marketing|paid media|pr manager|communications)\b/.test(t)) return 'marketing';
  if (/\b(data scientist|data engineer|data analyst|machine learning|ml engineer|ai engineer|nlp|bi analyst|analytics engineer|etl|data ops)\b/.test(t)) return 'data';
  if (/\b(finance|accounting|accountant|fp&a|cfo|controller|payroll|tax|treasury|bookkeeper|auditor)\b/.test(t)) return 'finance';
  if (/\b(sales|account executive|account manager|bdr|sdr|business development|revenue|partnerships manager)\b/.test(t)) return 'sales';
  if (/\b(recruiter|talent acquisition|hr manager|people ops|human resources|hr business partner|people partner)\b/.test(t)) return 'hr';
  if (/\b(legal counsel|attorney|paralegal|compliance officer|general counsel|privacy counsel)\b/.test(t)) return 'legal';
  if (/\b(operations manager|ops manager|chief of staff|supply chain|logistics|customer success|customer support|support engineer|implementation)\b/.test(t)) return 'operations';
  if (/\b(ux|ui|product designer|graphic designer|visual designer|brand designer|motion designer|design lead|illustrator|figma|interaction designer)\b/.test(t)) return 'design';

  // Engineering — check title for clear engineering indicators
  if (/\b(engineer|developer|programmer|architect|devops|sre|backend|frontend|fullstack|full.?stack|mobile|ios|android|embedded|firmware|infrastructure|cloud architect|platform engineer|security engineer|ml ops|mlops|data platform|reliability)\b/.test(t)) return 'engineering';

  // Fallback: check description but only for very specific engineering terms
  if (/\b(software engineer|frontend developer|backend developer|full.?stack developer|devops engineer|sre |cloud engineer|platform engineer|mobile developer|react developer|python developer|java developer|golang developer)\b/.test(td)) return 'engineering';
  if (/\b(product manager|product owner)\b/.test(td)) return 'product';
  if (/\b(marketing manager|content marketing|seo specialist|growth marketing)\b/.test(td)) return 'marketing';
  if (/\b(data scientist|machine learning engineer|data analyst)\b/.test(td)) return 'data';
  if (/\b(sales manager|account executive|business development)\b/.test(td)) return 'sales';
  if (/\b(hr manager|talent acquisition|people operations)\b/.test(td)) return 'hr';
  if (/\b(legal counsel|compliance manager)\b/.test(td)) return 'legal';
  if (/\b(ux designer|ui designer|product designer)\b/.test(td)) return 'design';
  if (/\b(finance manager|financial analyst|accounting manager)\b/.test(td)) return 'finance';

  return 'other';
}

const SKILLS = ['React','Vue','Angular','Next.js','TypeScript','JavaScript','Python','Go','Rust','Java','Kotlin','Swift','Node.js','Django','Rails','Docker','Kubernetes','AWS','GCP','Azure','Terraform','PostgreSQL','MySQL','MongoDB','Redis','GraphQL','REST','Figma','SQL','Spark','Airflow','dbt','Salesforce','HubSpot','Git','CI/CD','PyTorch','TensorFlow','NLP','Tableau','Power BI','Excel','Stripe','Twilio'];
function extractSkills(text: string): string[] {
  return SKILLS.filter(s => new RegExp(`\\b${s.replace('.','\\.')}\\b`, 'i').test(text)).slice(0, 8);
}
