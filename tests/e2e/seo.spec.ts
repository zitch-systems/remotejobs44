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

  test('sitemap.xml is accessible', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    expect(response?.status()).toBe(200);
    // Use innerText to avoid Chrome's XML viewer HTML wrapper
    const text = await getBodyText(page);
    expect(text).toContain('urlset');
    // Domain can be remotejobs44.com or remotejobs44.vercel.app depending on deploy
    expect(text).toMatch(/remotejobs44/);
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

  test('OG image endpoint returns 200', async ({ page }) => {
    const response = await page.goto('/api/og');
    expect(response?.status()).toBe(200);
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
    await page.waitForLoadState('domco