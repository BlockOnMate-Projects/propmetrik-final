import { Page, expect } from '@playwright/test';

/**
 * Login helper — authenticates via Keycloak SSO
 */
export async function login(
  page: Page,
  email = process.env.E2E_USER ?? 'admin@cedynhq.com',
  password = process.env.E2E_PASSWORD ?? ''
) {
  if (!password) {
    throw new Error('E2E_PASSWORD env var is required for the login helper (no credential is hardcoded).');
  }
  await page.goto('/');

  // If redirected to Keycloak login
  if (page.url().includes('keycloak') || page.url().includes('auth')) {
    await page.fill('input[name="username"], #username', email);
    await page.fill('input[name="password"], #password', password);
    await page.click('input[type="submit"], button[type="submit"]');
  }

  // Wait for dashboard to load
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  await expect(page.locator('body')).toBeVisible();
}

/**
 * Logout helper
 */
export async function logout(page: Page) {
  await page.goto('/api/auth/signout');
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(/\//, { timeout: 10000 });
}
