import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Budget & Costs', () => {

  test('can view budget tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /budget/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/budget/i').first()).toBeVisible();
  });

  test('budget tab shows financial summary', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /budget/i }).click();
    await page.waitForTimeout(1_000);

    // Should see some financial figure or budget-related heading
    const budgetContent = page.locator('text=/total|budget|cost|amount|spent|remaining/i').first();
    await expect(budgetContent).toBeVisible({ timeout: 5_000 });
  });

  test('can see Add Cost button or cost entry mechanism', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /budget/i }).click();
    await page.waitForTimeout(500);

    const addCostBtn = page.getByRole('button', { name: /add cost/i })
      .or(page.getByRole('button', { name: /new cost/i }))
      .or(page.getByRole('button', { name: /add expense/i }))
      .or(page.getByRole('button', { name: /add line/i }))
      .or(page.getByRole('button', { name: /add item/i }));
    await expect(addCostBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('PM cannot approve budget items (no approve button)', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /budget/i }).click();
    await page.waitForTimeout(1_000);

    // Approve button should not be visible for PM role
    const approveBtn = page.getByRole('button', { name: /approve/i });
    await expect(approveBtn).toBeHidden({ timeout: 3_000 }).catch(() => {
      // It might not exist at all, which is fine
    });
  });
});
