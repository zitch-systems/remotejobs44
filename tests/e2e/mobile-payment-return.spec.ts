import { expect, test } from '@playwright/test';

test('mobile checkout return is a fixed app handoff, not proof of payment', async ({ page }) => {
  await page.goto('/mobile/payment-return?reference=untrusted&redirect=https%3A%2F%2Fexample.com');
  await expect(page.getByRole('heading', { name: 'Return to RemoteJobs44', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open RemoteJobs44 app', exact: true }))
    .toHaveAttribute('href', 'remotejobs44://paystack-return');
  await expect(page.getByText('Your payment is confirmed only after verification.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to RemoteJobs44 website' })).toHaveAttribute('href', '/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
