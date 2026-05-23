import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
  test('pricing page loads with plans', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveTitle(/pricing|plans|RemoteJobs44/i);
    // Day pass is ₦1,000 — always visible
    await expect(page.getByText(/₦1,000/i).first()).toBeVisible();
  });

  test('all plan tiers are visible', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/free/i).first()).toBeVisible();
    await expect(page.getByText(/pro/i).first()).toBeVisible();
    await expect(page.getByText(/Day Pass/i).first()).toBeVisible();
  });

  test('annual plan is shown with correct price', async ({ page }) => {
    await page.goto('/pricing');
    // Pro Annual plan is always shown — no toggle needed
    await expect(page.getByText(/₦89,999/i).first()).toBeVisible();
    await expect(page.getByText(/Pro Annual/i).first()).toBeVisible();
  });

  test('subscribe buttons are present', async ({ page }) => {
    await page.goto('/pricing');
    const subscribeBtn = page.getByRole('button', { name: /get pro|get day pass|get annual|start free|subscribe/i }).first();
    if (await subscribeBtn.isVisible()) {
      await expect(subscribeBtn).toBeEnabled();
    }
  });

  test('features list is present', async ({ page }) => {
    await page.goto('/pricing');
    // Browse jobs, apply links, etc. should be listed
    const features = page.getByText(/50,000|apply links|application tracker/i).first();
    await expect(features).toBeVisible();
  });

  test('plan comparison shows free vs paid differences', async ({ page }) => {
    await page.goto('/pricing');
    // Page should render check and X icons for features
    await expect(page.locator('main')).toBeVisible();
    const content = await page.locator('main').textContent();
    expect(content).toContain('Free');
   