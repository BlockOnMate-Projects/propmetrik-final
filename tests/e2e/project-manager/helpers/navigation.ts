import { Page } from '@playwright/test';

/** Navigate to the projects list page and wait for it to load */
export async function goToProjects(page: Page) {
  await page.goto('/dashboard/projects');
  await page.waitForSelector('h1, h2, h3', { timeout: 10_000 });
}

/** Navigate to a specific project detail page */
export async function goToProject(page: Page, projectId: string, tab?: string) {
  const url = tab
    ? `/dashboard/projects/${projectId}?tab=${tab}`
    : `/dashboard/projects/${projectId}`;
  await page.goto(url);
  await page.waitForSelector('h1, h2, h3', { timeout: 10_000 });
}

/** Navigate to a specific project sub-page */
export async function goToProjectSubPage(page: Page, projectId: string, subPage: string) {
  await page.goto(`/dashboard/projects/${projectId}/${subPage}`);
  await page.waitForSelector('h1, h2, h3', { timeout: 10_000 });
}

/** Click a project in the list by name */
export async function clickProject(page: Page, projectName: string) {
  await page.getByRole('link', { name: projectName }).first().click();
  await page.waitForSelector('h1, h2, h3', { timeout: 10_000 });
}

/** Switch tab on the project detail page */
export async function switchTab(page: Page, tabName: string) {
  await page.getByRole('tab', { name: tabName }).click();
  // Wait a moment for tab content to render
  await page.waitForTimeout(500);
}

/** Wait for a success toast notification */
export async function waitForToast(page: Page, textMatch?: string | RegExp) {
  const toast = page.locator('[role="status"], [data-sonner-toast], .toast, .Toastify__toast');
  if (textMatch) {
    await toast.filter({ hasText: textMatch }).first().waitFor({ timeout: 10_000 });
  } else {
    await toast.first().waitFor({ timeout: 10_000 });
  }
}
