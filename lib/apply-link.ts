// lib/apply-link.ts — Resolve a job board's detail page to the employer's
// own application target.
//
// Feeds from aggregator boards (WP Job Manager sites etc.) link every item
// to the board's /job/... detail page; the employer's real apply link
// (their ATS posting, careers page, or an email) only exists in that
// page's HTML — WP Job Manager renders the `_application` meta into the
// apply section. extractDirectApplyLink finds that target so ingested
// jobs can send applicants straight to the company instead of bouncing
// through the board. Conservative by design: when nothing scores high
// enough we keep the board page, which still works for applicants.
import { validateExternalUrlAndResolve } from '@/lib/ssrf-guard';
import { detectATSFromUrl } from '@/lib/ats-detect';

export interface DirectApply {
  url?: string;
  email?: string;
}

// Hosts that appear on job detail pages but are never an apply target.
const NEVER_APPLY_HOSTS = new Set([
  'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'instagram.com',
  'pinterest.com', 'reddit.com', 'wa.me', 'whatsapp.com', 't.me',
  'threads.net', 'bsky.app', 'youtube.com', 'tiktok.com', 'medium.com',
  'wordpress.org', 'wordpress.com', 'gravatar.com',
]);

// Don't regex-scan unbounded HTML; apply sections live in the page body
// well before this cap on every board theme we care about.
const SCAN_MAX = 500_000;
const MAX_ANCHORS = 400;
// An anchor counts as "inside the apply section" when it appears within
// this many characters after an application/apply class or id.
const APPLY_WINDOW = 2_000;
const SCORE_THRESHOLD = 3;

interface Candidate {
  href: string;
  score: number;
  index: number;
  isMailto: boolean;
}

export function extractDirectApplyLink(html: string, boardPageUrl: string): DirectApply {
  let boardApex: string;
  try {
    boardApex = apexDomain(new URL(boardPageUrl).hostname);
  } catch {
    return {};
  }

  const doc = html.slice(0, SCAN_MAX);

  // Positions of apply/application containers — class="application_details",
  // class="job_application", id="apply" and friends.
  const applyMarks: number[] = [];
  const markRe = /(?:class|id)\s*=\s*["'][^"']*(?:application|apply)[^"']*["']/gi;
  let mm: RegExpExecArray | null;
  while ((mm = markRe.exec(doc)) !== null) applyMarks.push(mm.index);

  const candidates: Candidate[] = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]{0,300}?)<\/a>/gi;
  let am: RegExpExecArray | null;
  let seen = 0;
  while ((am = anchorRe.exec(doc)) !== null && seen < MAX_ANCHORS) {
    seen++;
    const attrs = am[1];
    const inner = am[2].replace(/<[^>]+>/g, ' ');
    const href = attrValue(attrs, 'href');
    if (!href) continue;

    const isMailto = /^mailto:/i.test(href);
    if (!isMailto) {
      let target: URL;
      try {
        target = new URL(href, boardPageUrl);
      } catch {
        continue;
      }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') continue;
      const apex = apexDomain(target.hostname);
      // Same-site links (job detail nav, categories, pagination) and
      // social/share links are never the employer's apply target.
      if (apex === boardApex || NEVER_APPLY_HOSTS.has(apex)) continue;
    }

    let score = 0;
    if (applyMarks.some(p => am!.index >= p && am!.index - p <= APPLY_WINDOW)) score += 3;
    if (/(?:class)\s*=\s*["'][^"']*(?:application|apply)[^"']*["']/i.test(attrs)) score += 3;
    if (!isMailto && detectATSFromUrl(new URL(href, boardPageUrl).toString())) score += 3;
    if (/apply|application/i.test(inner) || /apply|application/i.test(attrValue(attrs, 'title') ?? '') ||
        /apply|application/i.test(attrValue(attrs, 'aria-label') ?? '')) score += 2;
    if (/rel\s*=\s*["'][^"']*nofollow/i.test(attrs) && /target\s*=\s*["']_blank/i.test(attrs)) score += 1;

    if (score >= SCORE_THRESHOLD) {
      candidates.push({ href, score, index: am.index, isMailto });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  const out: DirectApply = {};
  const bestUrl = candidates.find(c => !c.isMailto);
  if (bestUrl) {
    try {
      out.url = new URL(bestUrl.href, boardPageUrl).toString();
    } catch { /* unreachable — parsed above */ }
  }
  const bestMail = candidates.find(c => c.isMailto);
  if (bestMail) {
    const email = decodeURIComponent(bestMail.href.replace(/^mailto:/i, '').split('?')[0]).trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.email = email;
  }
  return out;
}

export interface EnrichOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface EnrichResult {
  rows: Array<Record<string, any>>;
  fetched: number;
  enriched: number;
  emails: number;
  failed: number;
}

// Fetch each row's board detail page (rows[].apply_url) and swap in the
// employer's direct apply link / email when one is found. Rows whose page
// can't be fetched or yields nothing keep their board link — graceful
// degradation, never a dropped job. The caller decides which rows are
// worth fetching (and how many); this just does the fetching safely:
// SSRF-validated, redirects refused, per-page timeout and byte cap.
export async function enrichDirectApplyLinks(
  rows: Array<Record<string, any>>,
  opts: EnrichOptions = {},
): Promise<EnrichResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const concurrency = opts.concurrency ?? 5;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const maxBytes = opts.maxBytes ?? 1_500_000;

  const out = rows.slice();
  const res: EnrichResult = { rows: out, fetched: 0, enriched: 0, emails: 0, failed: 0 };

  for (let i = 0; i < out.length; i += concurrency) {
    const batch = out.slice(i, i + concurrency).map(async (row, bi) => {
      const pageUrl = typeof row.apply_url === 'string' ? row.apply_url : '';
      // DNS-aware guard: apply_url comes from third-party feeds (WP Job Manager
      // etc.), so a public hostname resolving to an internal IP must be blocked
      // before we fetch the page to enrich the direct-apply link.
      const v = await validateExternalUrlAndResolve(pageUrl);
      if (!v.ok) return;
      try {
        const r = await fetchImpl(v.url.toString(), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44/1.0; +https://remotejobs44.com)',
            'Accept': 'text/html, */*',
          },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        });
        res.fetched++;
        if (!r.ok) { res.failed++; return; }
        // Reject giants by declared Content-Length before buffering (header is
        // lie-able, so the post-buffer length check stays as the real cap).
        if (parseInt(r.headers.get('content-length') ?? '0', 10) > maxBytes) { res.failed++; return; }
        const html = await r.text();
        if (html.length > maxBytes) { res.failed++; return; }

        const direct = extractDirectApplyLink(html, pageUrl);
        if (!direct.url && !direct.email) return;
        const next = { ...row };
        if (direct.url) { next.apply_url = direct.url; res.enriched++; }
        if (direct.email) { next.apply_email = direct.email; res.emails++; }
        out[i + bi] = next;
      } catch {
        res.failed++; // timeout / network / redirect — board link stays
      }
    });
    await Promise.all(batch);
  }
  return res;
}

function attrValue(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : undefined;
}

// Naive eTLD+1 — good enough for "is this link still the board's own
// site" checks; over-matching (e.g. .co.uk apexes) only costs us a
// missed enrichment, never a wrong link.
function apexDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.');
  return parts.slice(-2).join('.');
}
