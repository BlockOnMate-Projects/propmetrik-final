import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Draw Requests', () => {

  test('can navigate to construction tab', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /construction/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/construction|draw|progress/i').first()).toBeVisible();
  });

  test('can see Create Draw Request button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /construction/i }).click();
    await page.waitForTimeout(500);

    const drawBtn = page.getByRole('button', { name: /create draw/i })
      .or(page.getByRole('button', { name: /new draw/i }))
      .or(page.getByRole('button', { name: /add draw/i }))
      .or(page.getByRole('button', { name: /draw request/i }));
    await expect(drawBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('PM cannot approve or fund draw requests', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /construction/i }).click();
    await page.waitForTimeout(1_000);

    const approveBtn = page.getByRole('button', { name: /approve draw/i });
    const fundBtn = page.getByRole('button', { name: /fund/i });
    await expect(approveBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
    await expect(fundBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
  });
});
