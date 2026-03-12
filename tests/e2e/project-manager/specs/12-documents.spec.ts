import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Documents', () => {

  test('can view documents tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /document/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/document|file|upload/i').first()).toBeVisible();
  });

  test('can see Upload Document button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /document/i }).click();
    await page.waitForTimeout(500);

    const uploadBtn = page.getByRole('button', { name: /upload/i })
      .or(page.getByRole('button', { name: /add document/i }))
      .or(page.getByRole('button', { name: /new document/i }));
    await expect(uploadBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('documents list area is visible', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /document/i }).click();
    await page.waitForTimeout(1_000);

    // Should see either a list of documents or an empty state
    const content = page.locator('text=/no documents|upload|document|file/i').first();
    await expect(content).toBeVisible({ timeout: 5_000 });
  });
});
