// lib/ats-engine.ts — Server-only ATS fetching for 5 platforms.
// All endpoints are FREE with no authentication required.
//
// The pure detection logic + types live in lib/ats-detect.ts so client
// components (admin/company-import) can import detectATSFromUrl without
// pulling puppeteer-core / @sparticuz/chromium into the browser bundle.
import type { Job, JobCategory, JobLevel } from './types';
import { uid } from './utils';
import { detectATSFromUrl, detectATSFromHtml, type ATSPlatform, type ATSDetectResult } from './ats-detect';
import { validateExternalUrl } from './ssrf-guard';
import { logInfo, logError } from './log';

// Fetch a user-supplied URL while re-validating EVERY redirect hop against the
// SSRF guard. Native `fetch` follows redirects automatically, so a public host
// that 302s to http://169.254.169.254/… (cloud metadata) would otherwise be
// fetched even though the initial host passed validation. `redirect: 'manual'`
// lets us check each Location before following. Career pages legitimately
// redirect, so we follow (bounded) rather than hard-erroring like /api/rss.
async function fetchFollowingValidatedRedirects(
  startUrl: string,
  init: RequestInit,
  maxRedirects = 4,
): Promise<Response> {
  let current = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      const next = new URL(loc, current).toString();
      const v = validateExternalUrl(next);
      if (!v.ok) throw new Error(`blocked redirect to a disallowed host: ${v.error}`);
      current = next;
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}

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
    greenhouse:      candidates,
    lever:           candidates,
    ashby:           candidates,
    workable:        candidates,
    recruitee:       candidates,
    // Workday needs tenant|shard|site — we don't have the shard/site without
    // visiting the page, so guessing isn't useful here.
    workday:         [],
    smartrecruiters: candidates,
    personio:        candidates,
    bamboohr:        candidates,
    jazzhr:          candidates,
    breezy:          candidates,
    // Comeet needs the numeric company ID — can't guess from name alone.
    comeet:          [],
    jobvite:         candidates,
    icims:           candidates,
    recruiterbox:    candidates,
    jobscore:        candidates,
    zohorecruit:     candidates,
    teamtailor:      candidates,
    manatal:         candidates,
    pinpoint:        candidates,
    jobadder:        candidates,
    talentlyft:      candidates,
    heyrecruit:      candidates,
    vivahr:          candidates,
    polymer:         candidates,
    // Taleo + SuccessFactors need tenant + site/company-id pairs.
    taleo:           [],
    successfactors:  candidates,
    // "25 more" batch — subdomain-style ones get the company slug, the
    // ones that need a UUID/path id we can't guess from name alone.
    bullhorn:        candidates,
    crelate:         candidates,
    newton:          candidates,
    cornerstone:     candidates,
    ukgpro:          candidates,
    adp:             [],
    paylocity:       [],
    loxo:            candidates,
    vincere:         candidates,
    avature:         candidates,
    eightfold:       candidates,
    phenom:          candidates,
    beamery:         candidates,
    hireology:       candidates,
    clearcompany:    candidates,
    hrpartner:       candidates,
    recooty:         candidates,
    skeeled:         candidates,
    hibob:           candidates,
    pcrecruiter:     candidates,
    catsone:         candidates,
    recruitcrm:      candidates,
    sagepeople:      candidates,
    workzoom:        candidates,
    hireserve:       candidates,
    unknown:         [],
  };
}

// ── Fetch jobs from any ATS ──────────────────────────────────────────────
export async function fetchATSJobs(platform: ATSPlatform, slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  try {
    switch (platform) {
      case 'greenhouse':      return await fetchGreenhouse(slug, sourceUrl);
      case 'lever':           return await fetchLever(slug, sourceUrl);
      case 'ashby':           return await fetchAshby(slug, sourceUrl);
      case 'workable':        return await fetchWorkable(slug, sourceUrl);
      case 'recruitee':       return await fetchRecruitee(slug, sourceUrl);
      case 'workday':         return await fetchWorkday(slug, sourceUrl);
      case 'smartrecruiters': return await fetchSmartRecruiters(slug, sourceUrl);
      case 'personio':        return await fetchPersonio(slug, sourceUrl);
      case 'bamboohr':        return await fetchBambooHR(slug, sourceUrl);
      case 'jazzhr':          return await fetchJazzHR(slug, sourceUrl);
      case 'breezy':          return await fetchBreezy(slug, sourceUrl);
      case 'comeet':          return await fetchComeet(slug, sourceUrl);
      case 'jobvite':         return await fetchJobvite(slug, sourceUrl);
      case 'icims':           return await fetchICIMS(slug, sourceUrl);
      case 'recruiterbox':    return await fetchRecruiterbox(slug, sourceUrl);
      case 'jobscore':        return await fetchJobScore(slug, sourceUrl);
      case 'zohorecruit':     return await fetchZohoRecruit(slug, sourceUrl);
      case 'teamtailor':      return await fetchTeamtailor(slug, sourceUrl);
      case 'manatal':         return await fetchManatal(slug, sourceUrl);
      case 'pinpoint':        return await fetchPinpoint(slug, sourceUrl);
      case 'jobadder':        return await fetchJobAdder(slug, sourceUrl);
      case 'talentlyft':      return await fetchTalentLyft(slug, sourceUrl);
      case 'heyrecruit':      return await fetchHeyrecruit(slug, sourceUrl);
      case 'vivahr':          return await fetchVivaHR(slug, sourceUrl);
      case 'polymer':         return await fetchPolymer(slug, sourceUrl);
      case 'taleo':           return await fetchTaleo(slug, sourceUrl);
      case 'successfactors':  return await fetchSuccessFactors(slug, sourceUrl);
      // ── "25 more" batch ──────────────────────────────────────────────
      case 'bullhorn':        return await fetchBullhorn(slug, sourceUrl);
      case 'crelate':         return await fetchCrelate(slug, sourceUrl);
      case 'newton':          return await fetchNewton(slug, sourceUrl);
      case 'cornerstone':     return await fetchCornerstone(slug, sourceUrl);
      case 'ukgpro':          return await fetchUkgPro(slug, sourceUrl);
      case 'adp':             return await fetchAdp(slug, sourceUrl);
      case 'paylocity':       return await fetchPaylocity(slug, sourceUrl);
      case 'loxo':            return await fetchLoxo(slug, sourceUrl);
      case 'vincere':         return await fetchVincere(slug, sourceUrl);
      case 'avature':         return await fetchAvature(slug, sourceUrl);
      case 'eightfold':       return await fetchEightfold(slug, sourceUrl);
      case 'phenom':          return await fetchPhenom(slug, sourceUrl);
      case 'beamery':         return await fetchBeamery(slug, sourceUrl);
      case 'hireology':       return await fetchHireology(slug, sourceUrl);
      case 'clearcompany':    return await fetchClearCompany(slug, sourceUrl);
      case 'hrpartner':       return await fetchHrPartner(slug, sourceUrl);
      case 'recooty':         return await fetchRecooty(slug, sourceUrl);
      case 'skeeled':         return await fetchSkeeled(slug, sourceUrl);
      case 'hibob':           return await fetchHiBob(slug, sourceUrl);
      case 'pcrecruiter':     return await fetchPcRecruiter(slug, sourceUrl);
      case 'catsone':         return await fetchCatsOne(slug, sourceUrl);
      case 'recruitcrm':      return await fetchRecruitCrm(slug, sourceUrl);
      case 'sagepeople':      return await fetchSagePeople(slug, sourceUrl);
      case 'workzoom':        return await fetchWorkzoom(slug, sourceUrl);
      case 'hireserve':       return await fetchHireserve(slug, sourceUrl);
      default:                return { jobs: [], total: 0, platform, slug, error: 'Unknown platform' };
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
    remote: isRemoteLocation(j.location?.name ?? ''),
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
    remote: isRemoteLocation(j.categories?.location ?? j.workplaceType ?? ''),
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
      remote: j.remote === true || j.workplace === 'remote' || isRemoteLocation(loc),
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
    remote: isRemoteLocation(j.location ?? j.tags?.join(' ') ?? ''),
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

// ── Workday ────────────────────────────────────────────────────────────────
// Workday's public board lives at `{tenant}.{shard}.myworkdayjobs.com/<site>`
// and the CXS jobs API requires all three. We encoded them as "tenant|shard|site"
// in the detect step so the slug round-trips cleanly through /api/ats.
async function fetchWorkday(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const [tenant, shard, site] = slug.split('|');
  if (!tenant || !shard || !site) {
    throw new Error(`Workday slug must encode tenant|shard|site (got "${slug}")`);
  }
  const url = `https://${tenant}.${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: '' }),
    signal: AbortSignal.timeout(15000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Workday ${res.status}: ${tenant}/${site} not found`);
  const data = await res.json();
  const postings = data.jobPostings ?? [];
  const tenantPretty = tenant.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const jobs: Partial<Job>[] = postings.map((j: any) => {
    const externalPath = j.externalPath ?? '';
    const applyUrl = externalPath
      ? `https://${tenant}.${shard}.myworkdayjobs.com${externalPath.startsWith('/') ? '' : '/'}${externalPath}`
      : sourceUrl;
    const location = j.locationsText ?? j.bulletFields?.[0] ?? 'Unknown';
    return {
      id: `wd_${j.bulletFields?.[0] ?? j.title ?? uid()}`,
      title: j.title,
      company: tenantPretty,
      description: stripHtml(j.shortDescription ?? ''),
      applyUrl,
      location,
      posted: j.postedOn ?? new Date().toISOString(),
      remote: isRemoteLocation(location),
      type: 'full-time',
      level: guessLevel(j.title ?? ''),
      category: guessCategory(j.title ?? '', ''),
      skills: extractSkills(j.title ?? ''),
      source: 'api',
      sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'workday', slug };
}

// ── SmartRecruiters ────────────────────────────────────────────────────────
// Public postings API — no auth, returns up to 100 per page. We stick to the
// first page (matches the other platforms' behaviour) so a single company
// with thousands of openings can't dominate the import.
async function fetchSmartRecruiters(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`SmartRecruiters ${res.status}: ${slug} not found`);
  const data = await res.json();
  const postings = data.content ?? [];
  const jobs: Partial<Job>[] = postings.map((j: any) => {
    const loc = j.location?.city
      ? `${j.location.city}${j.location.region ? ', ' + j.location.region : ''}${j.location.country ? ', ' + j.location.country.toUpperCase() : ''}`
      : (j.location?.country ?? 'Unknown');
    const remote = j.location?.remote === true || isRemoteLocation(loc);
    return {
      id: `sr_${j.id ?? j.uuid ?? uid()}`,
      title: j.name,
      company: j.company?.name ?? slug,
      description: stripHtml(j.jobAd?.sections?.jobDescription?.text ?? ''),
      applyUrl: j.ref ?? `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      location: loc,
      posted: j.releasedDate ?? j.createdOn ?? new Date().toISOString(),
      remote,
      type: mapSmartRecruitersType(j.typeOfEmployment?.id),
      level: guessLevel(j.name ?? ''),
      category: guessCategory(j.name ?? '', j.jobAd?.sections?.jobDescription?.text ?? ''),
      skills: extractSkills(j.name ?? ''),
      source: 'api',
      sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'smartrecruiters', slug };
}

function mapSmartRecruitersType(id?: string): any {
  const t = (id ?? '').toLowerCase();
  if (t.includes('part')) return 'part-time';
  if (t.includes('contract') || t.includes('temporary')) return 'contract';
  if (t.includes('intern')) return 'entry';
  return 'full-time';
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
    const pageRes = await fetchFollowingValidatedRedirects(url, {
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
  logInfo({ event: 'ats.auto_fetch.chromium_fallback', url });
  let renderError: string | undefined;
  try {
    const t0 = Date.now();
    const { renderHtml } = await import('@/lib/render-js');
    logInfo({ event: 'ats.auto_fetch.renderjs_loaded', url, elapsed_ms: Date.now() - t0 });
    const rendered = await renderHtml(url, { timeoutMs: 25_000 });
    logInfo({ event: 'ats.auto_fetch.rendered', url, bytes: rendered.length, elapsed_ms: Date.now() - t0 });
    const renderedDetect = detectATSFromHtml(rendered, url);
    if (renderedDetect) {
      logInfo({ event: 'ats.auto_fetch.chromium_found', url, platform: renderedDetect.platform, slug: renderedDetect.slug });
      const result = await fetchATSJobs(renderedDetect.platform, renderedDetect.slug, url);
      return { ...result, detected: renderedDetect };
    }
    renderError = 'rendered HTML had no ATS link either';
    logInfo({ event: 'ats.auto_fetch.chromium_no_ats', url, rendered_bytes: rendered.length });
  } catch (err: any) {
    // Render path is best-effort. If chromium fails to launch (e.g. local
    // dev without the binary), we just report the original "could not
    // detect" error rather than crashing the whole request.
    renderError = err?.message ?? String(err);
    logError({ event: 'ats.auto_fetch.renderjs_failed', url, error: renderError, stack: err?.stack?.slice(0, 500) });
  }

  // 4. Final fallback: extract a candidate slug from the URL host and probe
  //    the big public ATS APIs (Greenhouse, Lever, Ashby, Workable, Recruitee,
  //    SmartRecruiters) in parallel. Most company.com/careers pages are SPAs
  //    that load the ATS dynamically — the chromium fallback above SHOULD
  //    catch those but often times out or misses the embed. This is the
  //    pragmatic catchall: just try the company's name as a slug and see if
  //    any of the supported ATSes recognise it. First 2xx response wins.
  const slugs = candidateSlugsFromUrl(url);
  if (slugs.length > 0) {
    const probed = await probeKnownATSes(slugs);
    if (probed) {
      logInfo({ event: 'ats.auto_fetch.slug_guess_hit', platform: probed.platform, slug: probed.slug });
      const result = await fetchATSJobs(probed.platform, probed.slug, url);
      if (result.total > 0 || !result.error) {
        return {
          ...result,
          detected: {
            platform:    probed.platform,
            slug:        probed.slug,
            apiEndpoint: '',   // unknown — the probe doesn't track which URL hit
            confidence:  'low' as const,
          },
        };
      }
    }
  }

  return {
    jobs: [], total: 0, platform: 'unknown', slug: '', detected: null,
    error: renderError
      ? `Could not detect ATS (HTML scrape + JS render + slug probe all failed: ${renderError})`
      : 'Could not detect ATS from this URL',
  };
}

// Turn a URL host into a small set of candidate ATS slugs. For
// "https://www.bird.co/careers/" we try "bird", "bird-co", "bird.co".
// Stripping the leading www./careers./jobs. prefix is critical — without
// it we'd probe "wwwbird" which never matches.
function candidateSlugsFromUrl(url: string): string[] {
  let host: string;
  try { host = new URL(url).hostname; }
  catch { return []; }
  host = host.replace(/^(www\.|careers\.|jobs\.|join\.|apply\.|hire\.)+/i, '').toLowerCase();
  if (!host) return [];
  // Common TLDs to strip — keep the meaningful name only.
  const noTld = host
    .replace(/\.(com|io|co|ai|app|org|net|dev|so|tech|inc|me|xyz)(\.[a-z]{2})?$/, '')
    .replace(/\.(eu|uk|de|fr|nl|us|in|jp|au|ca)$/, '');
  const base = noTld.split('.')[0]; // first segment if dots remain
  const dashed = host.replace(/\./g, '-');
  return Array.from(new Set([base, noTld, dashed].filter(s => s && s.length >= 2)));
}

// Probe a small set of slug candidates against the 6 most reliable public
// ATS APIs. Returns the FIRST hit in (slug, ATS) priority order — so for
// ambiguous slugs like "bird" we'll consistently pick Greenhouse over
// Lever rather than racing them. Without ordering, two different
// companies that happen to share a slug would non-deterministically map
// onto whichever ATS responded first, corrupting the captured data.
//
// Each slug × ATS probe still runs in parallel within its (slug) tier;
// we just don't let a slower-but-higher-priority tier lose to a faster
// lower-priority one.
async function probeKnownATSes(slugs: string[]): Promise<{ platform: ATSPlatform; slug: string } | null> {
  // Priority order. Greenhouse first because (a) it has the largest
  // public-board customer base and (b) slugs there are owner-defined
  // (less collision-prone than Lever's, which uses normalised names).
  const targets: Array<{ platform: ATSPlatform; url: (s: string) => string; init?: RequestInit }> = [
    { platform: 'greenhouse',      url: s => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true` },
    { platform: 'ashby',           url: s => `https://api.ashbyhq.com/posting-api/job-board/${s}` },
    { platform: 'lever',           url: s => `https://api.lever.co/v0/postings/${s}?mode=json` },
    { platform: 'workable',        url: s => `https://apply.workable.com/api/v3/accounts/${s}/jobs`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: '', department: [], location: [], workplace: [], remote: [] }) } },
    { platform: 'recruitee',       url: s => `https://${s}.recruitee.com/api/offers` },
    { platform: 'smartrecruiters', url: s => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1` },
  ];

  async function probe(slug: string, t: typeof targets[number]): Promise<{ platform: ATSPlatform; slug: string } | null> {
    try {
      const res = await fetch(t.url(slug), { ...t.init, signal: AbortSignal.timeout(5_000) });
      if (res.ok) return { platform: t.platform, slug };
    } catch {}
    return null;
  }

  // Walk slug candidates in order (most-likely first). Within a slug,
  // walk ATSes in priority order and short-circuit on the first hit.
  for (const slug of slugs) {
    for (const t of targets) {
      const hit = await probe(slug, t);
      if (hit) return hit;
    }
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Decide whether a location string indicates a remote role. Adapters used to
// inline /remote/i.test(loc) which misses everything that doesn't literally
// spell out "remote" — "Worldwide", "Anywhere", "Global", "Distributed",
// "WFH" all describe remote jobs in practice. This is the same vocabulary
// the broadened /api/jobs query uses, so the boolean column and the
// fallback location-text query stay in lockstep.
export function isRemoteLocation(loc: string | null | undefined): boolean {
  if (!loc) return false;
  return /\b(remote|worldwide|anywhere|global|distributed|wfh|work.?from.?home)\b/i.test(loc);
}

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

function guessLevel(title: string): JobLevel {
  const t = title.toLowerCase();
  if (/staff|principal|architect/.test(t)) return 'lead';
  if (/senior|sr\.?|sr /.test(t)) return 'senior';
  if (/junior|jr\.?|entry|associate|intern|graduate/.test(t)) return 'entry';
  if (/vp|vice president|director|head of|chief|cto|ceo/.test(t)) return 'executive';
  return 'mid';
}

function guessCategory(title: string, desc: string): JobCategory {
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

// ══════════════════════════════════════════════════════════════════════════
//                  "20 more" ATS adapters — see ats-detect.ts
// ══════════════════════════════════════════════════════════════════════════
//
// These are best-effort public-API integrations. Each platform's response
// shape was modelled from public documentation; some may need a small
// follow-up tweak once we see real boards in the wild (date fields,
// location nesting, salary keys vary across platforms).
//
// Conventions used below:
// - Every fetcher accepts (slug, sourceUrl) and returns ATSFetchResult.
// - Non-2xx HTTP responses throw with `${Platform} ${status}: ${slug} not found`
//   so the autoFetchFromCareerUrl wrapper can surface them in the admin UI.
// - All fetchers use a 10–15s timeout and cache-revalidate the response for
//   5 minutes (`next: { revalidate: 300 }`) so a cron sweep is cheap.
// - Item arrays are accessed defensively (`?? []`) to survive shape drift.

// ── Tiny RSS/Atom parser ───────────────────────────────────────────────────
// Used by Jobvite, iCIMS, JazzHR, JobScore, Zoho. Pulls <item>/<entry> blocks
// and extracts a small set of fields. Not a full XML parser — just enough to
// turn well-formed feeds into Partial<Job>.
function parseFeedItems(xml: string): Array<Record<string, string>> {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  return blocks.map(block => {
    const pick = (tag: string): string => {
      // <tag>value</tag> OR <tag><![CDATA[value]]></tag>
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m?.[1]?.trim() ?? '';
    };
    const linkAttr = block.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    return {
      title: pick('title'),
      link: linkAttr ?? pick('link'),
      description: pick('description') || pick('summary') || pick('content'),
      pubDate: pick('pubDate') || pick('published') || pick('updated'),
      location: pick('location') || pick('city') || '',
      category: pick('category') || pick('department') || '',
    };
  });
}

// ── Personio ───────────────────────────────────────────────────────────────
async function fetchPersonio(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.jobs.personio.de/xml`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Personio ${res.status}: ${slug} not found`);
  const xml = await res.text();
  // Personio's feed uses <position>...</position> blocks.
  const blocks = xml.match(/<position\b[\s\S]*?<\/position>/gi) ?? [];
  const jobs: Partial<Job>[] = blocks.map(b => {
    const pick = (tag: string) => b.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() ?? '';
    const id = pick('id');
    const name = pick('name');
    const office = pick('office');
    const department = pick('department');
    return {
      id: `pn_${id || uid()}`,
      title: name,
      company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: stripHtml(pick('jobDescriptions') || pick('description')),
      applyUrl: `https://${slug}.jobs.personio.de/job/${id}`,
      location: office || 'Unknown',
      posted: pick('createdAt') || new Date().toISOString(),
      remote: isRemoteLocation(office),
      type: 'full-time',
      level: guessLevel(name),
      category: guessCategory(name, department),
      skills: extractSkills(name + ' ' + department),
      source: 'api', sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'personio', slug };
}

// ── BambooHR ───────────────────────────────────────────────────────────────
async function fetchBambooHR(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.bamboohr.com/careers/list`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000), next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`BambooHR ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.result ?? data.jobs ?? [];
  const jobs: Partial<Job>[] = items.map((j: any) => {
    const loc = [j.location?.city, j.location?.state, j.location?.country].filter(Boolean).join(', ') || 'Unknown';
    return {
      id: `bb_${j.id ?? uid()}`,
      title: j.jobOpeningName ?? j.title,
      company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: stripHtml(j.description ?? ''),
      applyUrl: j.jobUrl ?? `https://${slug}.bamboohr.com/careers/${j.id}`,
      location: loc,
      posted: j.datePosted ?? new Date().toISOString(),
      remote: j.location?.isRemote === true || isRemoteLocation(loc),
      type: mapEmploymentTypeStatus(j.employmentStatusLabel),
      level: guessLevel(j.jobOpeningName ?? ''),
      category: guessCategory(j.jobOpeningName ?? '', j.departmentLabel ?? ''),
      skills: extractSkills(j.jobOpeningName ?? ''),
      source: 'api', sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'bamboohr', slug };
}

function mapEmploymentTypeStatus(raw?: string): any {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('part')) return 'part-time';
  if (t.includes('contract') || t.includes('temp')) return 'contract';
  if (t.includes('intern')) return 'entry';
  return 'full-time';
}

// ── JazzHR (Employ) ────────────────────────────────────────────────────────
async function fetchJazzHR(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.applytojob.com/apply/jobs.xml`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`JazzHR ${res.status}: ${slug} not found`);
  const items = parseFeedItems(await res.text());
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `jz_${uid()}`,
    title: it.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'jazzhr', slug };
}

// ── Breezy HR ──────────────────────────────────────────────────────────────
async function fetchBreezy(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.breezy.hr/json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Breezy ${res.status}: ${slug} not found`);
  const data = await res.json();
  const positions = Array.isArray(data) ? data : (data.positions ?? []);
  const jobs: Partial<Job>[] = positions.map((j: any) => {
    const loc = j.location?.city
      ? `${j.location.city}${j.location.country?.name ? ', ' + j.location.country.name : ''}`
      : (j.location?.name ?? 'Unknown');
    return {
      id: `bz_${j._id ?? j.id ?? uid()}`,
      title: j.name,
      company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: stripHtml(j.description ?? ''),
      applyUrl: j.url ?? `https://${slug}.breezy.hr/p/${j._id}`,
      location: loc,
      posted: j.published_date ?? j.creation_date ?? new Date().toISOString(),
      remote: j.location?.is_remote === true || isRemoteLocation(loc),
      type: mapBreezyType(j.type?.name ?? j.category?.name),
      level: guessLevel(j.name),
      category: guessCategory(j.name, j.description ?? ''),
      skills: extractSkills(j.name + ' ' + (j.description ?? '')),
      source: 'api', sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'breezy', slug };
}

function mapBreezyType(raw?: string): any {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('part')) return 'part-time';
  if (t.includes('contract') || t.includes('freelance')) return 'contract';
  if (t.includes('intern')) return 'entry';
  return 'full-time';
}

// ── Comeet ─────────────────────────────────────────────────────────────────
// Slug arrives as "company-name|numeric-id" from the detect step.
async function fetchComeet(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const [name, id] = slug.split('|');
  if (!id) throw new Error(`Comeet slug must encode "name|id" (got "${slug}")`);
  const url = `https://www.comeet.com/careers-api/2.0/company/${id}/positions?details=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Comeet ${res.status}: ${id} not found`);
  const data = await res.json();
  const positions = Array.isArray(data) ? data : (data.positions ?? []);
  const jobs: Partial<Job>[] = positions.map((j: any) => {
    const loc = j.location?.name ?? [j.location?.city, j.location?.country].filter(Boolean).join(', ') ?? 'Unknown';
    return {
      id: `cm_${j.uid ?? uid()}`,
      title: j.name,
      company: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: stripHtml(j.details ?? j.description ?? ''),
      applyUrl: j.url_active ?? `https://www.comeet.com/jobs/${name}/${id}/${j.uid}`,
      location: loc,
      posted: j.time_updated ?? new Date().toISOString(),
      remote: isRemoteLocation(loc),
      type: 'full-time',
      level: guessLevel(j.name),
      category: guessCategory(j.name, j.details ?? ''),
      skills: extractSkills(j.name + ' ' + (j.details ?? '')),
      source: 'api', sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'comeet', slug };
}

// ── Jobvite ────────────────────────────────────────────────────────────────
async function fetchJobvite(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://jobs.jobvite.com/careers/${slug}/jobs.rss`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Jobvite ${res.status}: ${slug} not found`);
  const items = parseFeedItems(await res.text());
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `jv_${uid()}`,
    title: it.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'jobvite', slug };
}

// ── iCIMS ──────────────────────────────────────────────────────────────────
async function fetchICIMS(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://careers-${slug}.icims.com/jobs/feed`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`iCIMS ${res.status}: ${slug} not found`);
  const items = parseFeedItems(await res.text());
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `ic_${uid()}`,
    title: it.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'icims', slug };
}

// ── Recruiterbox / Trakstar Hire ───────────────────────────────────────────
async function fetchRecruiterbox(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.recruiterbox.com/widget/jobs.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Recruiterbox ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.jobs ?? data.openings ?? [];
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `rb_${j.id ?? uid()}`,
    title: j.title ?? j.position,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.description ?? ''),
    applyUrl: j.hosted_url ?? j.url ?? `https://${slug}.recruiterbox.com/jobs/${j.id}`,
    location: j.location?.city ?? j.location ?? 'Unknown',
    posted: j.published_on ?? j.created_at ?? new Date().toISOString(),
    remote: isRemoteLocation(j.location?.city ?? j.location ?? ''),
    type: mapBreezyType(j.employment_type),
    level: guessLevel(j.title ?? ''),
    category: guessCategory(j.title ?? '', j.description ?? ''),
    skills: extractSkills(j.title ?? ''),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'recruiterbox', slug };
}

// ── JobScore ───────────────────────────────────────────────────────────────
async function fetchJobScore(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://careers.jobscore.com/careers/${slug}/feeds/jobs.atom`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`JobScore ${res.status}: ${slug} not found`);
  const items = parseFeedItems(await res.text());
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `js_${uid()}`,
    title: it.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'jobscore', slug };
}

// ── Zoho Recruit ───────────────────────────────────────────────────────────
async function fetchZohoRecruit(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.zohorecruit.com/recruit/Rss.do?action=jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${slug} not found`);
  const items = parseFeedItems(await res.text());
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `zh_${uid()}`,
    title: it.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'zohorecruit', slug };
}

// ── Teamtailor ─────────────────────────────────────────────────────────────
// Teamtailor's authenticated REST API needs a token, but every public board
// has a /jobs.json endpoint that returns the listing.
async function fetchTeamtailor(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.teamtailor.com/jobs.json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000), next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Teamtailor ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.jobs ?? data.data ?? [];
  const jobs: Partial<Job>[] = items.map((j: any) => {
    const attrs = j.attributes ?? j;
    const loc = attrs.location?.name ?? attrs['location-name'] ?? attrs.location ?? 'Unknown';
    return {
      id: `tt_${j.id ?? uid()}`,
      title: attrs.title,
      company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: stripHtml(attrs.body ?? attrs.description ?? ''),
      applyUrl: attrs.url ?? attrs['careersite-job-url'] ?? `https://${slug}.teamtailor.com/jobs/${j.id}`,
      location: loc,
      posted: attrs['created-at'] ?? attrs.created_at ?? new Date().toISOString(),
      remote: attrs['remote-status'] === 'fully' || isRemoteLocation(loc),
      type: mapBreezyType(attrs['employment-type']),
      level: guessLevel(attrs.title ?? ''),
      category: guessCategory(attrs.title ?? '', attrs.body ?? ''),
      skills: extractSkills(attrs.title ?? ''),
      source: 'api', sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'teamtailor', slug };
}

// ── Manatal ────────────────────────────────────────────────────────────────
async function fetchManatal(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.manatal.com/api/career-website/positions`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Manatal ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.results ?? data.positions ?? [];
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `mn_${j.id ?? uid()}`,
    title: j.title ?? j.position_title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.description ?? ''),
    applyUrl: j.public_url ?? `https://${slug}.manatal.com/career/positions/${j.id}`,
    location: j.location ?? j.city ?? 'Unknown',
    posted: j.created_at ?? new Date().toISOString(),
    remote: j.is_remote === true || isRemoteLocation(j.location ?? ''),
    type: mapBreezyType(j.employment_type),
    level: guessLevel(j.title ?? ''),
    category: guessCategory(j.title ?? '', j.description ?? ''),
    skills: extractSkills(j.title ?? ''),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'manatal', slug };
}

// ── Pinpoint ───────────────────────────────────────────────────────────────
async function fetchPinpoint(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.pinpointhq.com/api/v1/public/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Pinpoint ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.data ?? data.jobs ?? [];
  const jobs: Partial<Job>[] = items.map((j: any) => {
    const attrs = j.attributes ?? j;
    const loc = attrs.location ?? attrs.locations?.[0]?.name ?? 'Unknown';
    return {
      id: `pp_${j.id ?? uid()}`,
      title: attrs.title,
      company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: stripHtml(attrs.description ?? ''),
      applyUrl: attrs.url ?? `https://${slug}.pinpointhq.com/jobs/${j.id}`,
      location: loc,
      posted: attrs.published_at ?? attrs.created_at ?? new Date().toISOString(),
      remote: attrs.remote === true || isRemoteLocation(loc),
      type: mapBreezyType(attrs.employment_type),
      level: guessLevel(attrs.title ?? ''),
      category: guessCategory(attrs.title ?? '', attrs.description ?? ''),
      skills: extractSkills(attrs.title ?? ''),
      source: 'api', sourceUrl: url,
      featured: false, isNew: true,
    };
  });
  return { jobs, total: jobs.length, platform: 'pinpoint', slug };
}

// ── JobAdder ───────────────────────────────────────────────────────────────
async function fetchJobAdder(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.jobadder.com/api/v1/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`JobAdder ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.items ?? data.jobs ?? [];
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `ja_${j.jobId ?? j.id ?? uid()}`,
    title: j.jobTitle ?? j.title,
    company: j.company?.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.summary ?? j.description ?? ''),
    applyUrl: j.applicationUrl ?? j.url,
    location: j.location?.name ?? j.location ?? 'Unknown',
    posted: j.postedAt ?? j.dateCreated ?? new Date().toISOString(),
    remote: isRemoteLocation(j.location?.name ?? ''),
    type: mapBreezyType(j.workType?.name),
    level: guessLevel(j.jobTitle ?? ''),
    category: guessCategory(j.jobTitle ?? '', j.summary ?? ''),
    skills: extractSkills(j.jobTitle ?? ''),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'jobadder', slug };
}

// ── TalentLyft ─────────────────────────────────────────────────────────────
async function fetchTalentLyft(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.talentlyft.com/api/v2/published-jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`TalentLyft ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.jobs ?? []);
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `tl_${j.id ?? uid()}`,
    title: j.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.description ?? ''),
    applyUrl: j.url ?? `https://${slug}.talentlyft.com/job/${j.id}`,
    location: j.location ?? j.city ?? 'Unknown',
    posted: j.publishDate ?? new Date().toISOString(),
    remote: j.isRemote === true || isRemoteLocation(j.location ?? ''),
    type: mapBreezyType(j.workType),
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.description ?? ''),
    skills: extractSkills(j.title),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'talentlyft', slug };
}

// ── Heyrecruit ─────────────────────────────────────────────────────────────
async function fetchHeyrecruit(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.heyrecruit.com/api/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Heyrecruit ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.jobs ?? []);
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `hr_${j.id ?? uid()}`,
    title: j.title,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.description ?? ''),
    applyUrl: j.url ?? `https://${slug}.heyrecruit.com/job/${j.id}`,
    location: j.location ?? 'Unknown',
    posted: j.publishedAt ?? j.createdAt ?? new Date().toISOString(),
    remote: isRemoteLocation(j.location ?? ''),
    type: 'full-time',
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.description ?? ''),
    skills: extractSkills(j.title),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'heyrecruit', slug };
}

// ── VivaHR ─────────────────────────────────────────────────────────────────
async function fetchVivaHR(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.vivahr.com/api/v1/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`VivaHR ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.jobs ?? data.data ?? []);
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `vh_${j.id ?? uid()}`,
    title: j.title ?? j.name,
    company: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(j.description ?? ''),
    applyUrl: j.url ?? j.apply_url ?? `https://${slug}.vivahr.com/jobs/${j.id}`,
    location: j.location ?? 'Unknown',
    posted: j.published_at ?? j.created_at ?? new Date().toISOString(),
    remote: isRemoteLocation(j.location ?? ''),
    type: mapBreezyType(j.employment_type),
    level: guessLevel(j.title ?? ''),
    category: guessCategory(j.title ?? '', j.description ?? ''),
    skills: extractSkills(j.title ?? ''),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'vivahr', slug };
}

// ── Polymer ────────────────────────────────────────────────────────────────
async function fetchPolymer(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://polymer.co/api/companies/${slug}/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Polymer ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.jobs ?? data.data ?? [];
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `pm_${j.id ?? uid()}`,
    title: j.title,
    company: j.company?.name ?? slug,
    description: stripHtml(j.description ?? ''),
    applyUrl: j.applyUrl ?? j.url ?? `https://polymer.co/${slug}/jobs/${j.id}`,
    location: j.location ?? 'Unknown',
    posted: j.publishedAt ?? new Date().toISOString(),
    remote: j.isRemote === true || isRemoteLocation(j.location ?? ''),
    type: 'full-time',
    level: guessLevel(j.title),
    category: guessCategory(j.title, j.description ?? ''),
    skills: extractSkills(j.title),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'polymer', slug };
}

// ── Oracle Taleo ───────────────────────────────────────────────────────────
// Slug arrives as "tenant|section" — Taleo URLs always have both.
async function fetchTaleo(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const [tenant, section] = slug.split('|');
  if (!tenant || !section) throw new Error(`Taleo slug must encode "tenant|section" (got "${slug}")`);
  const url = `https://${tenant}.taleo.net/careersection/rss/jobs.rss?lang=en&portal=${section}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Taleo ${res.status}: ${tenant}/${section} not found`);
  const items = parseFeedItems(await res.text());
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `tl_${uid()}`,
    title: it.title,
    company: tenant.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'taleo', slug };
}

// ── SAP SuccessFactors ─────────────────────────────────────────────────────
// SuccessFactors career sites expose a JSON search endpoint that takes the
// companyId as a query param. The endpoint host is whichever data centre the
// customer is on; .eu is the most common shard, so we default there and rely
// on follow-up tuning to add the other shards when we see them.
async function fetchSuccessFactors(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://career4.successfactors.eu/career?company=${slug}&_s.crb=&career_ns=job_listing_summary`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000), next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`SuccessFactors ${res.status}: ${slug} not found`);
  // SuccessFactors usually returns HTML by default; if we got HTML, extract
  // the embedded JSON job list rather than failing.
  const text = await res.text();
  let items: any[] = [];
  try {
    const data = JSON.parse(text);
    items = data.jobList ?? data.jobs ?? data.results ?? [];
  } catch {
    // Cheap HTML fallback — find JSON blob assignments in the markup.
    const m = text.match(/"jobList"\s*:\s*(\[[\s\S]*?\])/);
    if (m) {
      try { items = JSON.parse(m[1]); } catch { items = []; }
    }
  }
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `sf_${j.jobReqId ?? j.id ?? uid()}`,
    title: j.jobTitle ?? j.title,
    company: slug,
    description: stripHtml(j.jobDescription ?? j.externalJobDescription ?? ''),
    applyUrl: j.applyUrl ?? `https://career4.successfactors.eu/sfcareer/jobreqcareer?jobId=${j.jobReqId}&company=${slug}`,
    location: j.location ?? j.locationName ?? 'Unknown',
    posted: j.postingStartDate ?? new Date().toISOString(),
    remote: isRemoteLocation(j.location ?? ''),
    type: 'full-time',
    level: guessLevel(j.jobTitle ?? ''),
    category: guessCategory(j.jobTitle ?? '', j.jobDescription ?? ''),
    skills: extractSkills(j.jobTitle ?? ''),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'successfactors', slug };
}

// ══════════════════════════════════════════════════════════════════════════
//        "25 more" ATS adapters — gets total support to 52 platforms
// ══════════════════════════════════════════════════════════════════════════
//
// Same conventions as the earlier batches:
//   - (slug, sourceUrl) → ATSFetchResult
//   - non-2xx HTTP throws so autoFetchFromCareerUrl can report the failure
//   - 10–15s timeout + 5min revalidate cache
// Response shapes for the enterprise ATSes (ADP, Paylocity, Cornerstone,
// UKG Pro, Avature, Phenom, Beamery, Eightfold) are best-effort and may
// need a follow-up tweak once we see real boards. Detection is solid for
// all of them so URLs get categorised correctly even if the fetch errors.

function prettyCompany(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Some adapters return `{jobs:[...]}`, others `{data:[...]}`, others a bare
// array. This picker keeps the per-adapter code short.
function pickJobsArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.jobs ?? data?.data ?? data?.results ?? data?.items ?? data?.positions ?? data?.openings ?? [];
}

// Generic mapping shape — adapters with similar JSON layouts can lean on this.
function genericJob(j: any, opts: { company: string; sourceUrl: string; idPrefix: string; platform: ATSPlatform }): Partial<Job> {
  const title       = j.title ?? j.name ?? j.jobTitle ?? j.position ?? 'Untitled';
  const description = j.description ?? j.jobDescription ?? j.summary ?? j.content ?? '';
  const location    = j.location?.name ?? j.locationName ?? j.location ?? j.city ?? 'Unknown';
  const applyUrl    = j.applyUrl ?? j.apply_url ?? j.url ?? j.hostedUrl ?? j.link ?? opts.sourceUrl;
  const posted      = j.postedAt ?? j.posted_at ?? j.publishedAt ?? j.published_at ?? j.createdAt ?? j.created_at ?? new Date().toISOString();
  return {
    id:           `${opts.idPrefix}_${j.id ?? j._id ?? uid()}`,
    title,
    company:      opts.company,
    description:  stripHtml(String(description)),
    applyUrl,
    location:     typeof location === 'string' ? location : 'Unknown',
    posted,
    remote:       isRemoteLocation(String(location ?? '')),
    type:         'full-time',
    level:        guessLevel(title),
    category:     guessCategory(title, String(description)),
    skills:       extractSkills(`${title} ${description}`),
    source:       'api',
    sourceUrl:    opts.sourceUrl,
    featured:     false, isNew: true,
  };
}

// ── Bullhorn ──────────────────────────────────────────────────────────────
async function fetchBullhorn(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  // Public board widget — actual public API requires per-agency auth, but
  // the JobBoardSearch endpoint returns HTML w/ embedded JSON we'd have to
  // parse. For now, treat as best-effort: just hit the widget URL.
  const url = `https://${slug}.bullhornstaffing.com/JobBoardSearch`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Bullhorn ${res.status}: ${slug} not found`);
  // Bullhorn returns HTML; without scraping it we can't yield jobs reliably.
  // Return an empty success so callers know the board exists; admin can use
  // /admin/companies + a manual import for now.
  return { jobs: [], total: 0, platform: 'bullhorn', slug, error: 'Bullhorn widget HTML scraping not yet implemented' };
}

// ── Crelate ───────────────────────────────────────────────────────────────
async function fetchCrelate(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://app.crelate.com/p/${slug}/json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Crelate ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data.Jobs ?? data.jobs ?? [];
  const company = data.CompanyName ?? prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `crl_${j.Id ?? j.id ?? uid()}`,
    title: j.Title ?? j.title,
    company,
    description: stripHtml(j.Description ?? ''),
    applyUrl: j.ApplyUrl ?? j.Url ?? `https://app.crelate.com/p/${slug}/job/${j.Id}`,
    location: j.City ?? j.Location ?? 'Unknown',
    posted: j.PostedDate ?? j.CreatedDate ?? new Date().toISOString(),
    remote: isRemoteLocation(String(j.City ?? j.Location ?? '')),
    type: 'full-time',
    level: guessLevel(j.Title ?? ''),
    category: guessCategory(j.Title ?? '', j.Description ?? ''),
    skills: extractSkills(j.Title ?? ''),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'crelate', slug };
}

// ── Newton Software / iApplicants ─────────────────────────────────────────
async function fetchNewton(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.iapplicants.com/feed/?type=rss`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Newton ${res.status}: ${slug} not found`);
  const items = parseFeedItems(await res.text());
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `nwt_${uid()}`,
    title: it.title,
    company,
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'newton', slug };
}

// ── Cornerstone OnDemand (CSOD) ───────────────────────────────────────────
// CSOD's career-site search returns paginated JSON. We POST with an empty
// query to get the first page.
async function fetchCornerstone(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://careers-${slug}.csod.com/services/x/career-site/v1/search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageSize: 100, pageNumber: 0, searchText: '' }),
    signal: AbortSignal.timeout(15000), next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Cornerstone ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data?.data?.requisitions ?? data?.results ?? [];
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'csod', platform: 'cornerstone' }));
  return { jobs, total: jobs.length, platform: 'cornerstone', slug };
}

// ── UKG Pro Recruiting (formerly UltiPro) ─────────────────────────────────
async function fetchUkgPro(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://recruiting.ultipro.com/${slug}/JobBoard/api/jobs`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000), next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`UKG Pro ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = data?.companyName ?? prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'ukg', platform: 'ukgpro' }));
  return { jobs, total: jobs.length, platform: 'ukgpro', slug };
}

// ── ADP Workforce Now ─────────────────────────────────────────────────────
async function fetchAdp(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  // ADP's public posting page is HTML-only; the underlying jobs API requires
  // a session cookie. Mark as detected-only for now.
  return {
    jobs: [], total: 0, platform: 'adp', slug,
    error: 'ADP Workforce Now public jobs require an authenticated session — detection only',
  };
}

// ── Paylocity ─────────────────────────────────────────────────────────────
async function fetchPaylocity(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const [uuid, name] = slug.split('|');
  if (!uuid) throw new Error(`Paylocity slug must encode "uuid|name" (got "${slug}")`);
  const url = `https://recruiting.paylocity.com/Recruiting/Jobs/All/${uuid}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000), next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Paylocity ${res.status}: ${uuid} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = name ? prettyCompany(name) : 'Unknown';
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'pcy', platform: 'paylocity' }));
  return { jobs, total: jobs.length, platform: 'paylocity', slug };
}

// ── Loxo ──────────────────────────────────────────────────────────────────
async function fetchLoxo(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.loxo.co/api/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Loxo ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'lxo', platform: 'loxo' }));
  return { jobs, total: jobs.length, platform: 'loxo', slug };
}

// ── Vincere ───────────────────────────────────────────────────────────────
async function fetchVincere(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.vincere.io/api/v2/public/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Vincere ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'vnc', platform: 'vincere' }));
  return { jobs, total: jobs.length, platform: 'vincere', slug };
}

// ── Avature ───────────────────────────────────────────────────────────────
async function fetchAvature(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.avature.net/api/jobs.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Avature ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'avt', platform: 'avature' }));
  return { jobs, total: jobs.length, platform: 'avature', slug };
}

// ── Eightfold ─────────────────────────────────────────────────────────────
async function fetchEightfold(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.eightfold.ai/api/apply/v2/jobs?domain=${slug}.eightfold.ai&num=100&start=0`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Eightfold ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data?.positions ?? data?.jobs ?? [];
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => ({
    id: `eft_${j.id ?? uid()}`,
    title: j.name ?? j.title,
    company,
    description: stripHtml(j.description ?? ''),
    applyUrl: j.canonicalPositionUrl ?? `https://${slug}.eightfold.ai/careers/job/${j.id}`,
    location: j.locations?.[0] ?? j.location ?? 'Unknown',
    posted: j.t_create ? new Date(j.t_create * 1000).toISOString() : new Date().toISOString(),
    remote: isRemoteLocation(String(j.locations?.[0] ?? '')),
    type: 'full-time',
    level: guessLevel(j.name ?? ''),
    category: guessCategory(j.name ?? '', j.description ?? ''),
    skills: extractSkills(j.name ?? ''),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'eightfold', slug };
}

// ── Phenom People ─────────────────────────────────────────────────────────
async function fetchPhenom(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.phenompeople.com/widgets/jobsearch/api/search?start=0&rows=100`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Phenom ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = data?.refineSearch?.jobs ?? data?.jobs ?? [];
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'phn', platform: 'phenom' }));
  return { jobs, total: jobs.length, platform: 'phenom', slug };
}

// ── Beamery ───────────────────────────────────────────────────────────────
async function fetchBeamery(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.beamery.com/api/v1/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Beamery ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'bmr', platform: 'beamery' }));
  return { jobs, total: jobs.length, platform: 'beamery', slug };
}

// ── Hireology ─────────────────────────────────────────────────────────────
async function fetchHireology(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.hireology.com/api/v1/jobs.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Hireology ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'hlg', platform: 'hireology' }));
  return { jobs, total: jobs.length, platform: 'hireology', slug };
}

// ── ClearCompany ──────────────────────────────────────────────────────────
async function fetchClearCompany(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://careers.clearcompany.com/${slug}/api/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`ClearCompany ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'clc', platform: 'clearcompany' }));
  return { jobs, total: jobs.length, platform: 'clearcompany', slug };
}

// ── HrPartner ─────────────────────────────────────────────────────────────
async function fetchHrPartner(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.hrpartner.io/positions.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`HrPartner ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'hrp', platform: 'hrpartner' }));
  return { jobs, total: jobs.length, platform: 'hrpartner', slug };
}

// ── Recooty ───────────────────────────────────────────────────────────────
async function fetchRecooty(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.recooty.com/api/v1/jobs/`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Recooty ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'rct', platform: 'recooty' }));
  return { jobs, total: jobs.length, platform: 'recooty', slug };
}

// ── Skeeled ───────────────────────────────────────────────────────────────
async function fetchSkeeled(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://careers.skeeled.com/${slug}/api/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Skeeled ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'skl', platform: 'skeeled' }));
  return { jobs, total: jobs.length, platform: 'skeeled', slug };
}

// ── HiBob ─────────────────────────────────────────────────────────────────
async function fetchHiBob(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://apply.hibob.com/api/positions/${slug}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`HiBob ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'hbb', platform: 'hibob' }));
  return { jobs, total: jobs.length, platform: 'hibob', slug };
}

// ── PCRecruiter ───────────────────────────────────────────────────────────
async function fetchPcRecruiter(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.pcrjobs.com/jobs/feed?format=rss`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`PCRecruiter ${res.status}: ${slug} not found`);
  const items = parseFeedItems(await res.text());
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map(it => ({
    id: `pcr_${uid()}`,
    title: it.title,
    company,
    description: stripHtml(it.description),
    applyUrl: it.link,
    location: it.location || 'Unknown',
    posted: it.pubDate || new Date().toISOString(),
    remote: isRemoteLocation(it.location + ' ' + it.title),
    type: 'full-time',
    level: guessLevel(it.title),
    category: guessCategory(it.title, it.description),
    skills: extractSkills(it.title + ' ' + it.description),
    source: 'api', sourceUrl: url,
    featured: false, isNew: true,
  }));
  return { jobs, total: jobs.length, platform: 'pcrecruiter', slug };
}

// ── CATS One ──────────────────────────────────────────────────────────────
async function fetchCatsOne(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.catsone.com/careers/api/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`CATS One ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'cts', platform: 'catsone' }));
  return { jobs, total: jobs.length, platform: 'catsone', slug };
}

// ── Recruit CRM ───────────────────────────────────────────────────────────
async function fetchRecruitCrm(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.recruitcrm.io/api/v1/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Recruit CRM ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'rcr', platform: 'recruitcrm' }));
  return { jobs, total: jobs.length, platform: 'recruitcrm', slug };
}

// ── Sage People ───────────────────────────────────────────────────────────
async function fetchSagePeople(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.peoplexchange.com/services/apexrest/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Sage People ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'sgp', platform: 'sagepeople' }));
  return { jobs, total: jobs.length, platform: 'sagepeople', slug };
}

// ── Workzoom ──────────────────────────────────────────────────────────────
async function fetchWorkzoom(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.workzoom.com/api/jobs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Workzoom ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'wkz', platform: 'workzoom' }));
  return { jobs, total: jobs.length, platform: 'workzoom', slug };
}

// ── Hireserve ─────────────────────────────────────────────────────────────
async function fetchHireserve(slug: string, sourceUrl: string): Promise<ATSFetchResult> {
  const url = `https://${slug}.hireserve.com/api/vacancies`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Hireserve ${res.status}: ${slug} not found`);
  const data = await res.json();
  const items = pickJobsArray(data);
  const company = prettyCompany(slug);
  const jobs: Partial<Job>[] = items.map((j: any) => genericJob(j, { company, sourceUrl: url, idPrefix: 'hsv', platform: 'hireserve' }));
  return { jobs, total: jobs.length, platform: 'hireserve', slug };
}
