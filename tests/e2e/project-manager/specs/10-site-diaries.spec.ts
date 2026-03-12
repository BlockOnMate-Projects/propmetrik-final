import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Site Diaries', () => {

  test('can navigate to site diary on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    // Site diary might be a sub-page or a tab
    const siteTab = page.getByRole('tab', { name: /site.?diary|daily.?log|field.?report/i });
    const siteLink = page.getByRole('link', { name: /site.?diary|daily.?log|field.?report/i });

    const tabVisible = await siteTab.first().isVisible().catch(() => false);
    const linkVisible = await siteLink.first().isVisible().catch(() => false);

    if (tabVisible) {
      await siteTab.first().click();
    } else if (linkVisible) {
      await siteLink.first().click();
    } else {
      // Try navigating directly via URL
      const currentUrl = page.url();
      const projectId = currentUrl.match(/projects\/([a-f0-9-]+)/)?.[1];
      if (projectId) {
        await page.goto(`/dashboard/projects/${projectId}/site-diary`);
      }
    }
    await page.waitForTimeout(500);
  });

  test('can see create site diary entry button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    // Navigate to site diary area
    const siteTab = page.getByRole('tab', { name: /site.?diary|daily.?log|field.?report/i });
    if (await siteTab.first().isVisible().catch(() => false)) {
      await siteTab.first().click();
      await page.waitForTimeout(500);
    }

    const createBtn = page.getByRole('button', { name: /add entry|new entry|create entry|add log|new log|add diary/i });
    await expect(createBtn.first()).toBeVisible({ timeout: 5_000 });
  });
});
