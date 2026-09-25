import { test, expect } from '@playwright/test';

test.describe('320px mobile audit', () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test('primary public pages do not overflow the viewport', async ({ page }) => {
    for (const path of ['/', '/jobs', '/pricing', '/resources', '/salary-guide', '/login', '/register']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
    }
  });

  test('jobs mobile filters use full-width rows and 44px targets', async ({ page }) => {
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });

    const controls = [
      page.getByRole('combobox', { name: 'Sort jobs' }),
      page.getByRole('button', { name: 'Filters' }),
      page.getByRole('button', { name: 'Remote', exact: true }),
      page.getByRole('button', { name: 'All Jobs' }),
    ];

    for (const control of controls) {
      await expect(control).toBeVisible();
      const height = await control.evaluate((element) =>
        element.getBoundingClientRect().height,
      );
      expect(height).toBeGreaterThanOrEqual(44);
    }

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
