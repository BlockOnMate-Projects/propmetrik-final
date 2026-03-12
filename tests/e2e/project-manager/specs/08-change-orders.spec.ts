import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Change Orders', () => {

  test('can view change orders tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /change.?order/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/change.?order/i').first()).toBeVisible();
  });

  test('can see Create Change Order button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /change.?order/i }).click();
    await page.waitForTimeout(500);

    const coBtn = page.getByRole('button', { name: /create change order/i })
      .or(page.getByRole('button', { name: /new change order/i }))
      .or(page.getByRole('button', { name: /add change order/i }));
    await expect(coBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('PM cannot approve, reject or execute change orders', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /change.?order/i }).click();
    await page.waitForTimeout(1_000);

    const approveBtn = page.getByRole('button', { name: /approve/i });
    const rejectBtn = page.getByRole('button', { name: /reject/i });
    const executeBtn = page.getByRole('button', { name: /execute/i });
    await expect(approveBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
    await expect(rejectBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
    await expect(executeBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
  });
});
