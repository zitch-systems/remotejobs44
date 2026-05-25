// lib/ats-detect.ts — Pure client-safe ATS detection.
// Lives separately from lib/ats-engine.ts because that file pulls in
// puppeteer-core / @sparticuz/chromium (Node-only) via its render fallback,
// which breaks client bundles (admin/company-import imports detectATSFromUrl).

export type ATSPlatform =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'recruitee'
  | 'workday'
  | 'smartrecruiters'
  // ── Adapters added in the "20 more" batch ──────────────────────────────
  | 'personio'
  | 'bamboohr'
  | 'jazzhr'
  | 'breezy'
  | 'comeet'
  | 'jobvite'
  | 'icims'
  | 'recruiterbox'
  | 'jobscore'
  | 'zohorecruit'
  | 'teamtailor'
  | 'manatal'
  | 'pinpoint'
  | 'jobadder'
  | 'talentlyft'
  | 'heyrecruit'
  | 'vivahr'
  | 'polymer'
  | 'taleo'
  | 'successfactors'
  | 'unknown';

export interface ATSDetectResult {
  platform: ATSPlatform;
  slug: string;
  apiEndpoint: string;
  confidence: 'high' | 'medium' | 'low';
}

// Path segments that look like company slugs but aren't — these come from
// embed widgets / API routes / static assets. Without this guard, a careers
// page that embeds `boards.greenhouse.io/embed/job_board?for=noom` would be
// detected with slug=`embed` and then 404 on the API.
const RESERVED_SLUGS = new Set([
  'embed', 'job_board', 'jobboard', 'job-board', 'api', 'widget', 'iframe',
  'partner', 'partners', 'job', 'jobs', 'careers', 'career', 'about',
  'static', 'assets', 'images', 'css', 'js', 'fonts', 'public', 'company',
]);

// ── ATS URL patterns (slug + API URL builders) ────────────────────────────
export const ATS_URL_PATTERNS: Array<{
  platform: ATSPlatform;
  regex: RegExp;
  extractSlug: (match: RegExpMatchArray) => string;
  buildApi: (slug: string) => string;
}> = [
  // Greenhouse — also matches the new job-boards.greenhouse.io domain
  {
    platform: 'greenhouse',
    regex: /(?:job-)?boards\.greenhouse\.io\/([a-z0-9_-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
  },
  // Lever
  {
    platform: 'lever',
    regex: /jobs\.lever\.co\/([a-z0-9_-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://api.lever.co/v0/postings/${slug}?mode=json`,
  },
  // Ashby
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
    buildApi: slug => `https://apply.workable.com/api/v3/accounts/${slug}/jobs`,
  },
  // Workable: company.workable.com
  {
    platform: 'workable',
    regex: /([a-z0-9-]+)\.workable\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://apply.workable.com/api/v3/accounts/${slug}/jobs`,
  },
  // Recruitee
  {
    platform: 'recruitee',
    regex: /([a-z0-9-]+)\.recruitee\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.recruitee.com/api/offers`,
  },
  // Workday — tenant lives on a shard subdomain (wd1/wd3/wd5/wd103) and
  // each board has a site path (e.g. "External", "NVIDIAExternalCareerSite").
  // The CXS jobs endpoint needs all three pieces, so we encode them into the
  // slug as "tenant|shard|site" and split when fetching.
  // Optional `/en-US/` (or other locale) sits between the host and the site.
  {
    platform: 'workday',
    regex: /([a-z0-9-]+)\.(wd[0-9]+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Za-z]{2,4}\/)?([A-Za-z0-9_-]+)/,
    extractSlug: m => `${m[1]}|${m[2]}|${m[3]}`,
    buildApi: slug => {
      const [tenant, shard, site] = slug.split('|');
      return `https://${tenant}.${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
    },
  },
  // SmartRecruiters — three public URL shapes all map to the same API.
  {
    platform: 'smartrecruiters',
    regex: /(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/,
    extractSlug: m => m[1],
    buildApi: slug => `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
  },
  {
    platform: 'smartrecruiters',
    regex: /([a-z0-9-]+)\.smartrecruiters\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
  },

  // ── "20 more" batch ────────────────────────────────────────────────────
  // Personio — supports both .de and .com TLDs (some EU customers use .es too).
  // Public XML feed at /xml.
  {
    platform: 'personio',
    regex: /([a-z0-9-]+)\.jobs\.personio\.(?:de|com|es)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.jobs.personio.de/xml`,
  },
  // BambooHR — /careers/list returns JSON with all open roles.
  {
    platform: 'bamboohr',
    regex: /([a-z0-9-]+)\.bamboohr\.com\/(?:careers|jobs)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.bamboohr.com/careers/list`,
  },
  // JazzHR / Employ — applytojob.com subdomain, jobs.xml is a public RSS feed.
  {
    platform: 'jazzhr',
    regex: /([a-z0-9-]+)\.applytojob\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.applytojob.com/apply/jobs.xml`,
  },
  // Breezy HR — JSON at /json.
  {
    platform: 'breezy',
    regex: /([a-z0-9-]+)\.breezy\.hr/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.breezy.hr/json`,
  },
  // Comeet — URL shape is comeet.com/jobs/{company-slug}/{numeric-id}.
  // The careers API needs the numeric id, so we encode both as "name|id".
  {
    platform: 'comeet',
    regex: /(?:www\.)?comeet\.com\/(?:jobs|careers)\/([a-z0-9-]+)\/([A-Z0-9.]+)/i,
    extractSlug: m => `${m[1]}|${m[2]}`,
    buildApi: slug => {
      const [, id] = slug.split('|');
      return `https://www.comeet.com/careers-api/2.0/company/${id}/positions?details=true`;
    },
  },
  // Jobvite — RSS feed at /careers/{co}/jobs.rss; also matches {co}.jobvite.com.
  {
    platform: 'jobvite',
    regex: /jobs\.jobvite\.com\/(?:careers\/)?([a-z0-9-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://jobs.jobvite.com/careers/${slug}/jobs.rss`,
  },
  {
    platform: 'jobvite',
    regex: /([a-z0-9-]+)\.jobvite\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://jobs.jobvite.com/careers/${slug}/jobs.rss`,
  },
  // iCIMS — careers-{co}.icims.com, RSS feed at /jobs/feed.
  {
    platform: 'icims',
    regex: /careers-([a-z0-9-]+)\.icims\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://careers-${slug}.icims.com/jobs/feed`,
  },
  // Recruiterbox / Trakstar Hire — public widget JSON.
  {
    platform: 'recruiterbox',
    regex: /([a-z0-9-]+)\.recruiterbox\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.recruiterbox.com/widget/jobs.json`,
  },
  // JobScore — Atom feed.
  {
    platform: 'jobscore',
    regex: /careers\.jobscore\.com\/careers\/([a-z0-9-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://careers.jobscore.com/careers/${slug}/feeds/jobs.atom`,
  },
  // Zoho Recruit — RSS at /recruit/Rss.do?action=jobs. Also matches .eu/.in.
  {
    platform: 'zohorecruit',
    regex: /([a-z0-9-]+)\.zohorecruit\.(?:com|eu|in)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.zohorecruit.com/recruit/Rss.do?action=jobs`,
  },
  // Teamtailor — public JSON-LD on each board; their public JSON endpoint is
  // /jobs.json (returns up to 20 jobs without auth for most boards).
  {
    platform: 'teamtailor',
    regex: /([a-z0-9-]+)\.teamtailor\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.teamtailor.com/jobs.json`,
  },
  // Manatal — career-website API.
  {
    platform: 'manatal',
    regex: /([a-z0-9-]+)\.manatal\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.manatal.com/api/career-website/positions`,
  },
  // Pinpoint — public jobs API.
  {
    platform: 'pinpoint',
    regex: /([a-z0-9-]+)\.pinpointhq\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.pinpointhq.com/api/v1/public/jobs`,
  },
  // JobAdder — public board JSON.
  {
    platform: 'jobadder',
    regex: /([a-z0-9-]+)\.jobadder\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.jobadder.com/api/v1/jobs`,
  },
  // TalentLyft — embeddable jobs JSON.
  {
    platform: 'talentlyft',
    regex: /([a-z0-9-]+)\.talentlyft\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.talentlyft.com/api/v2/published-jobs`,
  },
  // Heyrecruit — JSON jobs endpoint.
  {
    platform: 'heyrecruit',
    regex: /([a-z0-9-]+)\.heyrecruit\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.heyrecruit.com/api/jobs`,
  },
  // VivaHR — JSON jobs endpoint.
  {
    platform: 'vivahr',
    regex: /([a-z0-9-]+)\.vivahr\.com/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://${slug}.vivahr.com/api/v1/jobs`,
  },
  // Polymer — careers hosted at polymer.co/{co}.
  {
    platform: 'polymer',
    regex: /polymer\.co\/([a-z0-9-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://polymer.co/api/companies/${slug}/jobs`,
  },
  // Oracle Taleo — career-section JSON. Pattern needs both tenant + section,
  // encoded as "tenant|section" so the fetcher can build the URL.
  {
    platform: 'taleo',
    regex: /([a-z0-9-]+)\.taleo\.net\/careersection\/([a-z0-9_-]+)/i,
    extractSlug: m => `${m[1]}|${m[2]}`,
    buildApi: slug => {
      const [tenant, section] = slug.split('|');
      return `https://${tenant}.taleo.net/careersection/rss/jobs.rss?lang=en&portal=${section}`;
    },
  },
  // SAP SuccessFactors — career site URL shape is career{N}.successfactors.{tld}
  // with a companyId query param. We encode "shard|companyId" so fetchers can
  // reconstruct the API URL.
  {
    platform: 'successfactors',
    regex: /career[0-9]*\.successfactors\.(?:eu|com)\/career.*?company=([a-z0-9-]+)/i,
    extractSlug: m => m[1],
    buildApi: slug => `https://career4.successfactors.eu/career?company=${slug}&_s.crb=&career_ns=job_listing`,
  },
];

// Greenhouse's embed widget — `boards.greenhouse.io/embed/job_board?for=COMPANY`
// — would otherwise match the generic Greenhouse pattern and get slug `embed`.
// Pull the real slug out of the `for` query param instead.
function detectGreenhouseEmbed(text: string): ATSDetectResult | null {
  const m = text.match(/(?:job-)?boards\.greenhouse\.io\/embed\/job_board[^"'\s>]*?[?&]for=([a-z0-9_-]+)/i);
  if (!m) return null;
  const slug = m[1];
  return {
    platform: 'greenhouse',
    slug,
    apiEndpoint: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    confidence: 'high',
  };
}

function tryAllPatterns(text: string, baseConfidence: 'high' | 'medium'): ATSDetectResult | null {
  const embed = detectGreenhouseEmbed(text);
  if (embed) return { ...embed, confidence: baseConfidence };

  for (const p of ATS_URL_PATTERNS) {
    const m = text.match(p.regex);
    if (!m) continue;
    const slug = p.extractSlug(m);
    // Skip false positives like /embed, /api, /careers used as path segments.
    // Workday slugs are "tenant|shard|site" — they can never collide with the
    // single-token reserved list, so the check still applies safely.
    const firstToken = slug.split('|')[0].toLowerCase();
    if (RESERVED_SLUGS.has(firstToken)) continue;
    return {
      platform: p.platform,
      slug,
      apiEndpoint: p.buildApi(slug),
      confidence: baseConfidence,
    };
  }
  return null;
}

export function detectATSFromUrl(url: string): ATSDetectResult | null {
  return tryAllPatterns(url, 'high');
}

export function detectATSFromHtml(html: string, _pageUrl: string): ATSDetectResult | null {
  const direct = tryAllPatterns(html, 'medium');
  if (direct) return direct;

  // Detect from script src attributes
  const scriptMatches = [...html.matchAll(/src="([^"]+)"/gi)].map(m => m[1]);
  for (const src of scriptMatches) {
    const r = detectATSFromUrl(src);
    if (r) return { ...r, confidence: 'low' };
  }

  return null;
}
