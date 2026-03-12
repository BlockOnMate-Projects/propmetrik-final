import { Page, expect } from '@playwright/test';

/**
 * Navigate to a top-level service tab (Overview, Valuations, Deals, Projects, etc.)
 */
export async function navigateToService(page: Page, serviceName: string) {
  const nav = page.locator('nav');
  await nav.getByText(serviceName, { exact: false }).first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to the Deals section
 */
export async function navigateToDeals(page: Page) {
  await navigateToService(page, 'DEALS');
  await page.waitForURL(/\/dashboard\/deals/, { timeout: 10000 });
}

/**
 * Navigate to a CRM sidebar item (Deals, Properties, Contacts, etc.)
 */
export async function navigateToCrmSection(page: Page, section: string) {
  const sidebar = page.locator('[class*="sidebar"], aside, nav').filter({ hasText: section });
  await sidebar.getByText(section, { exact: false }).first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to a specific deal by ID
 */
export async function navigateToDeal(page: Page, dealId: string) {
  await page.goto(`/dashboard/deals/${dealId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=DEAL STAGE')).toBeVisible({ timeout: 10000 });
}

/**
 * Navigate to new deal form
 */
export async function navigateToNewDeal(page: Page) {
  await page.goto('/dashboard/deals/new');
  await page.waitForLoadState('networkidle');
}
