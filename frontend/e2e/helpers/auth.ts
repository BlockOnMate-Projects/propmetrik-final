import { Page, expect } from '@playwright/test';

/**
 * Login helper — authenticates via Keycloak SSO
 */
export async function login(
  page: Page,
  email = 'admin@cedynhq.com',
  password = 'Delta0246@'
) {
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
