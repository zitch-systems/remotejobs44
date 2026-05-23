import { test, expect } from '@playwright/test';

// Helper: get email input robustly (inputs use labels but no for/id wiring)
const emailInput = (page: any) => page.locator('input[type="email"]').first();
const passwordInput = (page: any) => page.locator('input[type="password"]').first();
const nameInput = (page: any) =>
  page.locator('input[autocomplete="name"], input[placeholder*="name" i], input[name="name"]').first();

test.describe('Authentication', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/sign in|login|RemoteJobs44/i);
    await expect(emailInput(page)).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
  });

  test('login form validates empty fields', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.getByRole('button', { name: /sign in/i });
    await expect(submitBtn).toBeDisabled();
  });

  test('login with wrong credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await emailInput(page).fill('wrong@example.com');
    await passwordInput(page).fill('wrongpassword123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(4000);
    const errorMsg = page.getByText(/wrong email|invalid|incorrect|try again|credentials/i);
    await expect(errorMsg).toBeVisible();
  });

  test('forgot password link works', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/forgot-password/);
  });

  test('register link on login page works', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /create|register|sign up/i }).click();
    await expect(page).toHaveURL(/register/);
  });

  test('Google OAuth button is present', async ({ page }) => {
    await page.goto('/login');
    const googleBtn = page.getByRole('button', { name: /google/i });
    await expect(googleBtn).toBeVisible();
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/login');
    // Locate by placeholder — stable regardless of type attribute changes and id availability
    const pwInput = page.getByPlaceholder('••••••••');
    await pwInput.fill('testpassword');
    const toggleBtn = page.getByRole('button', { name: /show password/i });
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      // After toggle the input type changes to "text" — re-locate by placeholder
      // since the CSS-type locator would break. Use the same placeholder locator.
      const pwInputAfter = page.getByPlaceholder('••••••••');
      await expect(pwInputAfter).toHaveAttribute('type', 'text');
      const hideBtn = page.getByRole('button', { name: /hide password/i });
      await hideBtn.click();
      await expect(pwInputAfter).toHaveAttribute('type', 'password');
    }
  });

  test('register page loads correctly', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveTitle(/register|create account|RemoteJobs44/i);
    // Name field — check by placeholder or autocomplete attr
    await expect(nameInput(page)).toBeVisible();
    await expect(emailInput(page)).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
  });

  test('register form validates password strength', async ({ page }) => {
    await page.goto('/register');
    await passwordInput(page).fill('weak');
    await page.waitForTimeout(500);
    // Strength bar should render — check at least one bar segment is visible
    const strengthBars = page.locator('.h-1.flex-1.rounded-full');
    await expect(strengthBars.first()).toBeVisible();
  });

  test('register form disables submit without agreement', async ({ page }) => {
    await page.goto('/register');
    await nameInput(page).fill('Test User');
    await emailInput(page).fill('test@example.com');
    await passwordInput(page).fill('StrongPass123');
    // Terms checkbox not ticked — submit must be disabled
    const submitBtn = page.getByRole('button', { name: /create/i });
    await expect(submitBtn).toBeDisabled();
  });

  test('forgot password page has email field', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(emailInput(page)).toBeVisibl