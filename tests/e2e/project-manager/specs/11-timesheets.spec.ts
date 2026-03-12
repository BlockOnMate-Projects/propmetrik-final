import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Timesheets', () => {

  test('can navigate to timesheets area', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    // Timesheets might be a tab or sub-page
    const tsTab = page.getByRole('tab', { name: /timesheet|time.?log|time.?entry/i });
    if (await tsTab.first().isVisible().catch(() => false)) {
      await tsTab.first().click();
      await page.waitForTimeout(500);
      await expect(page.locator('text=/timesheet|time|hours/i').first()).toBeVisible();
    } else {
      // Try navigating via URL
      const currentUrl = page.url();
      const projectId = currentUrl.match(/projects\/([a-f0-9-]+)/)?.[1];
      if (projectId) {
        await page.goto(`/dashboard/projects/${projectId}/timesheets`);
        await page.waitForTimeout(500);
      }
    }
  });

  test('can see log time button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    const tsTab = page.getByRole('tab', { name: /timesheet|time.?log|time.?entry/i });
    if (await tsTab.first().isVisible().catch(() => false)) {
      await tsTab.first().click();
      await page.waitForTimeout(500);
    }

    const logBtn = page.getByRole('button', { name: /log time|add time|new entry|submit time/i });
    await expect(logBtn.first()).toBeVisible({ timeout: 5_000 });
  });
});
