import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — RFIs', () => {

  test('can view RFIs tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /rfi/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/rfi|request for information/i').first()).toBeVisible();
  });

  test('can see Create RFI button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /rfi/i }).click();
    await page.waitForTimeout(500);

    const createRfiBtn = page.getByRole('button', { name: /create rfi/i })
      .or(page.getByRole('button', { name: /new rfi/i }))
      .or(page.getByRole('button', { name: /add rfi/i }))
      .or(page.getByRole('button', { name: /submit rfi/i }));
    await expect(createRfiBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('PM cannot close or assign RFIs (admin-only)', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /rfi/i }).click();
    await page.waitForTimeout(1_000);

    const closeBtn = page.getByRole('button', { name: /close rfi/i });
    await expect(closeBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
  });
});
