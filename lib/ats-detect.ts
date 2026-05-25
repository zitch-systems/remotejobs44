// lib/ats-detect.ts — Pure client-safe ATS detection.
// Lives separately from lib/ats-engine.ts because that file pulls in
// puppeteer-core / @sparticuz/chromium (Node-only) via its render fallback,
// which breaks client bundles (admin/company-import imports detectATSFromUrl).

export type ATSPlatform = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee' | 'unknown';

export interface ATSDetectResult {
  platform: ATSPlatform;
  slug: string;
  apiEndpoint: string;
  confidence: 'high' | 'medium' | 'low';
}

// ── ATS URL patterns (slug + API URL builders) ────────────────────────────
export const ATS_URL_PATTERNS: Array<{
  platform: ATSPlatform;
  regex: RegExp;
  extractSlug: (match: RegExpMatchArray) => string;
  buildApi: (slug: string) => string;
}> = [
  // Greenhouse
  {
    platform: 'greenhouse',
    regex: /boards\.greenhouse\.io\/([a-z0-9_-]+)/i,
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
];

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

export function detectATSFromHtml(html: string, _pageUrl: string): ATSDetectResult | null {
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

  // Detect from script src attributes
  const scriptMatches = [...html.matchAll(/src="([^"]+)"/gi)].map(m => m[1]);
  for (const src of scriptMatches) {
    const r = detectATSFromUrl(src);
    if (r) return { ...r, confidence: 'low' };
  }

  return null;
}
