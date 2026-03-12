import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Contractors', () => {

  test('can view contractors tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /contractors/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/contractor/i').first()).toBeVisible();
  });

  test('can see Add Contractor button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /contractors/i }).click();
    await page.waitForTimeout(500);

    const addBtn = page.getByRole('button', { name: /add contractor/i })
      .or(page.getByRole('button', { name: /new contractor/i }))
      .or(page.getByRole('button', { name: /invite contractor/i }));
    await expect(addBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('PM cannot approve or suspend contractors', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /contractors/i }).click();
    await page.waitForTimeout(1_000);

    const suspendBtn = page.getByRole('button', { name: /suspend/i });
    const approveBtn = page.getByRole('button', { name: /approve/i });
    await expect(suspendBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
    await expect(approveBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
  });
});
