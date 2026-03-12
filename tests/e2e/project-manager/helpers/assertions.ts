import { Page, expect } from '@playwright/test';

/** Assert that the current page shows the correct role badge */
export async function assertRole(page: Page, role: string) {
  const roleBadge = page.locator('text=' + role.replace(/_/g, ' ')).first();
  await expect(roleBadge).toBeVisible({ timeout: 5_000 });
}

/** Assert that a nav tab is visible in the TopNav */
export async function assertTabVisible(page: Page, tabName: string) {
  await expect(page.getByRole('link', { name: tabName }).first()).toBeVisible();
}

/** Assert that a nav tab is NOT visible in the TopNav */
export async function assertTabHidden(page: Page, tabName: string) {
  await expect(page.getByRole('link', { name: tabName })).toHaveCount(0);
}

/** Assert that a button with specific text exists on the page */
export async function assertButtonVisible(page: Page, name: string | RegExp) {
  await expect(page.getByRole('button', { name }).first()).toBeVisible();
}

/** Assert that a button with specific text does NOT exist */
export async function assertButtonHidden(page: Page, name: string | RegExp) {
  await expect(page.getByRole('button', { name })).toHaveCount(0);
}

/** Assert the page has specific text content */
export async function assertPageContains(page: Page, text: string | RegExp) {
  await expect(page.locator('body')).toContainText(text);
}

/** Assert an API response returns a specific status code */
export async function assertApiStatus(page: Page, method: string, url: string, expectedStatus: number) {
  const response = await page.request.fetch(url, { method: method as any });
  expect(response.status()).toBe(expectedStatus);
}
