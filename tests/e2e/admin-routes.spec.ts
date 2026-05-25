import { test, expect } from '@playwright/test';

// These pages all require an admin / authenticated session — for an
// unauthenticated visitor they should redirect to /login (or render a
// "verifying access" gate that doesn't expose admin data).
// We don't try to sign in here — that'd need a fixture user with role='admin'
// in the database. Anonymous-redirect coverage catches the most common
// regressions (forgetting auth gates on a new page).

test.describe('Admin route guards (anonymous)', () => {
  test('/admin redirects unauth to /login', async ({ page }) => {
    await page.goto('/admin');
    // AdminLayout's check() routes to /login?next=/admin when getUser fails 401.
    await page.waitForURL(/\/login/, { timeout: 8000 });
    expect(page.url()).toMatch(/\/login/);
  });

  test('/admin/users redirects unauth to /login', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL(/\/login/, { timeout: 8000 });
  });

  test('/admin/users/[id] redirects unauth to /login', async ({ page }) => {
    await page.goto('/admin/users/00000000-0000-0000-0000-000000000000');
    await page.waitForURL(/\/login/, { timeout: 8000 });
  });

  test('/admin/companies redirects unauth to /login', async ({ page }) => {
    await page.goto('/admin/companies');
    await page.waitForURL(/\/login/, { timeout: 8000 });
  });
});

test.describe('Admin API routes (anonymous)', () => {
  test('GET /api/admin/users/:id returns 401', async ({ request }) => {
    const res = await request.get('/api/admin/users/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/admin/users/:id returns 401', async ({ request }) => {
    const res = await request.patch('/api/admin/users/00000000-0000-0000-0000-000000000000', {
      data: { plan: 'pro' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/users/:id/reset-password returns 401', async ({ request }) => {
    const res = await request.post('/api/admin/users/00000000-0000-0000-0000-000000000000/reset-password');
    // All admin routes now use the shared requireAdmin helper: 401 for
    // missing session, 403 only when a real user is authed-but-not-admin.
    expect(res.status()).toBe(401);
  });

  test('GET /api/admin/companies returns 401', async ({ request }) => {
    const res = await request.get('/api/admin/companies');
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/companies/refresh returns 401', async ({ request }) => {
    const res = await request.post('/api/admin/companies/refresh', { data: {} });
    expect(res.status()).toBe(401);
  });
});

test.describe('Profile self-service routes (anonymous)', () => {
  test('GET /api/profile/billing returns 401', async ({ request }) => {
    const res = await request.get('/api/profile/billing');
    expect(res.status()).toBe(401);
  });

  test('GET /api/profile/email-prefs returns 401', async ({ request }) => {
    const res = await request.get('/api/profile/email-prefs');
    expect(res.status()).toBe(401);
  });

  test('POST /api/profile/cancel-subscription returns 401', async ({ request }) => {
    const res = await request.post('/api/profile/cancel-subscription');
    expect(res.status()).toBe(401);
  });

  test('POST /api/profile/delete-account returns 401', async ({ request }) => {
    const res = await request.post('/api/profile/delete-account', {
      data: { confirm: 'DELETE' },
    });
    expect(res.status()).toBe(401);
  });

  test('/profile/billing redirects unauth to /login', async ({ page }) => {
    await page.goto('/profile/billing');
    // 15s rather than 8s — the redirect fires from a client useEffect AFTER
    // Zustand rehydrates, and on a cold dev server /login also has to compile.
    await page.waitForURL(/\/login/, { timeout: 15000 });
  });
});
