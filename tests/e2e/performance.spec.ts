import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('homepage first contentful paint is fast', async ({ page }) => {
    // Navigate and wait for load, then read already-recorded FCP from performance timeline
    await page.goto('/');
    await page.waitForLoadState('load');
    // Give paint events time to be recorded
    await page.waitForTimeout(500);

    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
      return fcpEntry ? fcpEntry.startTime : null;
    });

    if (fcp === null) {
      // FCP not recorded yet (rare on some browsers/configs) — skip rather than fail
      test.skip(true, 'FCP not captured in this browser context');
    } else {
      // Allow up to 5s — real-world cold start on Vercel can be 3-4s
      expect(fcp).toBeLessThan(5000);
    }
  });

  test('jobs page loads without timeout', async ({ page }) => {
    await page.goto('/jobs', { timeout: 15000 });
    await expect(page.locator('main')).toBeVisible();
  });

  test('no JavaScript errors on critical pages', async ({ page }) => {
    const criticalPages = ['/', '/jobs', '/pricing', '/login', '/register'];
    for (const path of criticalPages) {
      const errors: string[] = [];
      const handler = (err: Error) => errors.push(err.message);
      page.on('pageerror', handler);
      await page.goto(path);
      await page.waitForTimeout(1000);
      page.off('pageerror', handler);
      // Filter known benign errors
      const appErrors = errors.filter(
        (e) =>
          !e.includes('ResizeObserver') &&
          !e.includes('Non-Error') &&
          !e.includes('ChunkLoadError') &&
          !e.includes('Loading chunk')
      );
      expect(appErrors).toHaveLength(0);
    }
  });

  test('images are lazy-loaded', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForTimeout(2000);
    const allImages = await page.locator('img').count();
    if (allImages > 2) {
      const lazyImages = await page.locator('img[loading="lazy"]').count();
      expect(lazyImages).toBeGreaterThan(0);
    }
  });

  test('DOM loads within 8 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.