// lib/ats-engine.ts — Server-only ATS fetching for 5 platforms.
// All endpoints are FREE with no authentication required.
//
// The pure detection logic + types live in lib/ats-detect.ts so client
// components (admin/company-import) can import detectATSFromUrl without
// pulling puppeteer-core / @sparticuz/chromium into the browser bundle.
import type { Job } from './types';
import { uid } from './utils';
import { detectATSFromUrl, detectATSFromHtml, type ATSPlatform, type ATSDetectResult } from './ats-detect';

// Re-export so existing imports of `from '@/lib/ats-engine'` still work.
export { detectATSFromUrl, detectATSFromHtml };
export type { ATSPlatform, ATSDetectResult };

export interface ATSFetchResult {
  jobs: Partial<Job>[];
  total: number;
  platform: ATSPlatform;
  slug: string;
  error?: string;
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
  // Ashby's posting-api now returns `data.jobs` (it was `jobPostings` in
  // an older version). Accept both so we keep working if they rename
  // either field later.
  const postings = data.jobs ?? data.jobPostings ?? [];
  const jobs: Partial<Job>[] = postings.map((j: any) => ({
    id: `ash_${j.id ?? uid()}`,
    title: j.title,
    company: data.organization?.name ?? data.name ?? slug,
    description: stripHtml(j.descriptionHtml ?? j.description ?? ''),
    // Ashby exposes per-job urls under several names depending on the API
    // version: jobUrl (new), applyUrl, hostedUrl, or you have to construct
    // from /<slug>/<job-id>.
    applyUrl: j.jobUrl ?? j.applyUrl ?? j.hostedUrl ?? `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    location: j.isRemote ? 'Remote' : (j.locationName ?? j.location ?? 'Unknown'),
    posted: j.publishedAt ?? j.publishedDate ?? new Date().toISOString(),
    remote: j.isRemote === true || j.workplaceType === 'Remote',
    type: mapAshbyType(j.employmentType),
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.description ?? ''),
    skills: extractSkills(j.title + ' ' + (j.description ?? '')),
    salaryMin: j.compensation?.minValue ?? j.compensation?.compensationTierSummary?.minValue ?? undefined,
    salaryMax: j.compensation?.maxValue ?? j.compensation?.compensationTierSummary?.maxValue ?? undefined,
    currency: j.compensation?.currency ?? 'USD',
    source: 'api',
    sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'ashby', slug };
}

function mapAshbyType(raw: string | undefined): 'full-time' | 'part-time' | 'contract' | 'freelance' {
  const t = (raw ?? '').toLowerCase();
  if (t === 'parttime' || t === 'part-time' || t === 'part_time') return 'part-time';
  if (t === 'contract' || t === 'temporary' || t === 'temp')      return 'contract';
  if (t === 'intern' || t === 'internship')                       return 'contract';
  return 'full-time';
}

// ── Workable ───────────────────────────────────────────────────────────────
// Workable retired the public widget jobs endpoint a while back. The current
// public board API is v3 and requires a POST with empty filter arrays.
async function fetchWorkable(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://apply.workable.com/api/v3/accounts/${slug}/jobs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '', department: [], location: [], workplace: [], remote: [] }),
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Workable ${res.status}: ${slug} not found`);
  const data = await res.json();
  // v3 returns { total, results: [{ shortcode, title, description, location, ...}] }
  const positions = data.results ?? [];
  const jobs: Partial<Job>[] = positions.map((j: any) => {
    const loc = j.location?.city
      ? `${j.location.city}${j.location.region ? ', ' + j.location.region : ''}${j.location.country ? ', ' + j.location.country : ''}`
      : (j.location?.country ?? (j.remote ? 'Remote' : 'Unknown'));
    return {
      id: `wk_${j.shortcode ?? j.id ?? uid()}`,
      title: j.title,
      company: j.account?.name ?? slug,
      description: stripHtml(j.description ?? ''),
      applyUrl: j.url ?? `https://apply.workable.com/${slug}/j/${j.shortcode}`,
      location: loc,
      posted: j.published_on ?? j.created_at ?? new Date().toISOString(),
      remote: j.remote === true || j.workplace === 'remote' || /remote/i.test(loc),
      type: mapWorkableType(j.employment_type ?? j.type),
      level: guessLevel(j.title),
      category: guessCategory(j.title, j.description ?? ''),
      skills: extractSkills(j.title + ' ' + (j.description ?? '')),
      source: 'api',
      sourceUrl: url,
      featured: false, isNew: true,
    };
  });
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
  // 1. Try to detect ATS directly from the URL.
  const directDetect = detectATSFromUrl(url);
  if (directDetect) {
    const result = await fetchATSJobs(directDetect.platform, directDetect.slug, url);
    return { ...result, detected: directDetect };
  }

  // 2. Fetch the page and inspect its server-rendered HTML for ATS links.
  //    Cheap path — works for sites where the careers page links out to a
  //    boards.greenhouse.io / jobs.lever.co URL in the markup itself.
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

  // 3. Last resort: render the page with headless Chromium to catch ATS
  //    links that are only injected after the JS bundle runs (Next.js
  //    SPAs, custom React boards, Sequoia/a16z-style portfolio pages).
  //    Expensive — ~5-8s and ~512MB RAM — so only attempt after the
  //    cheap HTML scrape in step 2 found nothing.
  try {
    const { renderHtml } = await import('@/lib/render-js');
    const rendered = await renderHtml(url, { timeoutMs: 25_000 });
    const renderedDetect = detectATSFromHtml(rendered, url);
    if (renderedDetect) {
      const result = await fetchATSJobs(renderedDetect.platform, renderedDetect.slug, url);
      return { ...result, detected: renderedDetect };
    }
  } catch (err: any) {
    // Render path is best-effort. If chromium fails to launch (e.g. local
    // dev without the binary), we just report the original "could not
    // detect" error rather than crashing the whole request.
    console.error('[autoFetchFromCareerUrl render-js]', err?.message ?? err);
  }

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
