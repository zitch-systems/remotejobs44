// lib/render-js.ts
// Server-side JavaScript rendering using @sparticuz/chromium + puppeteer-core.
// Lets us scrape SPAs (Next.js/React/Vue pages whose job data only appears
// after JS executes) without paying for a third-party scraping service.
//
// Cost shape: ~5-8s wall time and ~512MB RAM per render — call from /api/ats
// only as a last resort, after the plain-HTML scrape failed to find an ATS
// link. Cache results aggressively.
//
// Vercel constraint: the function must run on the Node.js runtime (not Edge),
// must have maxDuration ≥ 30s, and must include @sparticuz/chromium in the
// serverComponentsExternalPackages list (next.config.js).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { validateExternalUrl } from '@/lib/ssrf-guard';

// 5-minute in-memory cache so a second click on the same URL doesn't pay the
// full render cost again. Process-scoped — fine for one Vercel function
// instance; next deploy starts fresh.
type CacheEntry = { html: string; at: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function renderHtml(rawUrl: string, opts?: { waitForSelector?: string; timeoutMs?: number }): Promise<string> {
  // Reuse the SSRF guard from /api/rss — chromium fetching internal URLs
  // would be just as bad as fetch() doing it.
  const v = validateExternalUrl(rawUrl);
  if (!v.ok) throw new Error(`URL rejected by SSRF guard: ${v.error}`);
  const url = v.url.toString();

  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.html;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      // @sparticuz/chromium recent versions removed the `.headless` property
      // — the chromium it ships is always headless, so we just pass true.
      headless: true,
    });

    const page = await browser.newPage();
    // Cut bandwidth and time — we only need HTML, not images / fonts / video.
    await page.setRequestInterception(true);
    page.on('request', req => {
      const t = req.resourceType();
      if (t === 'image' || t === 'media' || t === 'font' || t === 'stylesheet') {
        return req.abort();
      }
      // Re-check the SUB-RESOURCE URL against the SSRF guard. The
      // initial validateExternalUrl above only covers the top-level
      // navigation; once chromium starts running the page's JS, it
      // can issue fetch()/XHR/iframe loads to any URL it wants. A
      // page passing the initial public-host check could still
      // trigger `fetch('http://169.254.169.254/latest/meta-data/...')`
      // (cloud metadata) or hit a private VPC service. The response
      // is then visible in `page.content()` — extractable via DOM
      // injection.
      //
      // Validate every sub-request the same way; on failure abort
      // the single request, NOT the whole render. This lets a page
      // legitimately attempt many internal calls and we just block
      // them one by one.
      const sub = validateExternalUrl(req.url());
      if (!sub.ok) return req.abort();
      return req.continue();
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: opts?.timeoutMs ?? 25_000,
    });

    if (opts?.waitForSelector) {
      try {
        await page.waitForSelector(opts.waitForSelector, { timeout: 5_000 });
      } catch {}
    }

    const html = await page.content();
    cache.set(url, { html, at: Date.now() });
    return html;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
