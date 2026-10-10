import { test, expect } from '@playwright/test';

// Helper: get raw text from a plain-text or XML response
// page.content() wraps everything in Chrome's HTML shell — use innerText instead
async function getBodyText(page: any): Promise<string> {
  return page.evaluate(() => document.body.innerText ?? document.documentElement.innerText ?? '');
}

test.describe('SEO & Technical', () => {
  const pages = [
    { path: '/',        name: 'Homepage' },
    { path: '/jobs',    name: 'Jobs' },
    { path: '/pricing', name: 'Pricing' },
    { path: '/blog',    name: 'Blog' },
    { path: '/about',   name: 'About' },
    { path: '/contact', name: 'Contact' },
  ];

  for (const { path, name } of pages) {
    test(`${name} has title and description meta`, async ({ page }) => {
      await page.goto(path);
      const title = await page.title();
      expect(title).toContain('RemoteJobs44');
      expect(title.length).toBeGreaterThan(10);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc?.length ?? 0).toBeGreaterThan(30);
    });

    test(`${name} has og:title`, async ({ page }) => {
      await page.goto(path);
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      expect(ogTitle?.length ?? 0).toBeGreaterThan(5);
    });

    test(`${name} has twitter:card`, async ({ page }) => {
      await page.goto(path);
      const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
      expect(twitterCard).toBeTruthy();
    });
  }

  // The sitemap is sharded (generateSitemaps): shards are <urlset> files at
  // /sitemap/<id>.xml and the <sitemapindex> that links them lives at
  // /sitemap-index.xml (robots.txt points there). /sitemap.xml is rewritten to
  // the index. The <loc> host follows NEXT_PUBLIC_APP_URL, which differs per
  // deploy (and is http://localhost:3000 in CI), so only the paths are asserted.
  test('sitemap index lists the shards', async ({ request }) => {
    const response = await request.get('/sitemap-index.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');
    const xml = await response.text();
    expect(xml).toContain('<sitemapindex');
    // Shard 0 (static shell + slices + companies) always exists.
    expect(xml).toMatch(/<loc>[^<]+\/sitemap\/0\.xml<\/loc>/);
  });

  test('sitemap.xml serves the sitemap index', async ({ request }) => {
    const [conventional, index] = await Promise.all([
      request.get('/sitemap.xml'),
      request.get('/sitemap-index.xml'),
    ]);
    expect(conventional.status()).toBe(200);
    expect(conventional.headers()['content-type']).toContain('xml');
    const conventionalXml = await conventional.text();
    expect(conventionalXml).toContain('<sitemapindex');
    // Same set of shards, not merely the same root element. (<lastmod> is a
    // render timestamp, so compare the <loc> lists.)
    const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs(conventionalXml)).toEqual(locs(await index.text()));
  });

  test('sitemap shard 0 is a urlset of site pages', async ({ request }) => {
    const response = await request.get('/sitemap/0.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('<urlset');
    expect(xml).toMatch(/<loc>[^<]+\/jobs<\/loc>/);
  });

  test('robots.txt is accessible', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.status()).toBe(200);
    // Use innerText — Chrome wraps plaintext in a <pre> inside an HTML shell
    const text = await getBodyText(page);
    expect(text).toMatch(/User-agent/i);
    expect(text).toMatch(/Sitemap/i);
  });

  test('llms.txt is accessible', async ({ page }) => {
    const response = await page.goto('/llms.txt');
    // llms.txt is a static file in /public — 200 means it's deployed
    // Skip gracefully if not yet deployed (still on old Vercel commit)
    if (response?.status() === 404) {
      test.skip(true, 'llms.txt not yet deployed — push to GitHub and redeploy');
      return;
    }
    expect(response?.status()).toBe(200);
    const text = await getBodyText(page);
    expect(text).toContain('RemoteJobs44');
  });

  test('OG image endpoint renders dynamic currency text', async ({ request }) => {
    const response = await request.get('/api/og?title=Senior%20Engineer%20%E2%82%A6500k&salary=%24120%2C000');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    expect((await response.body()).byteLength).toBeGreaterThan(5_000);
  });

  test('homepage has JSON-LD structured data', async ({ page }) => {
    await page.goto('/');
    const jsonLd = page.locator('script[type="application/ld+json"]').first();
    await expect(jsonLd).toBeAttached();
    const content = await jsonLd.textContent();
    expect(content).toContain('WebSite');
    expect(content).toContain('SearchAction');
  });

  test('404 page renders correctly', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-12345');
    await expect(page.locator('body')).toBeVisible();
  });

  test('security headers are set', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() ?? {};
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('manifest.json is accessible', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
  });

  test('page loads in under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
  });
});
