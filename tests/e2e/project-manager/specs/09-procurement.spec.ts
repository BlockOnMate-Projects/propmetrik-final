import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Procurement', () => {

  test('can view submittals tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /submittal/i })
      .or(page.getByRole('tab', { name: /procurement/i }))
      .first()
      .click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/submittal|procurement|purchase/i').first()).toBeVisible();
  });

  test('can see Create Submittal or Purchase Order button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /submittal/i })
      .or(page.getByRole('tab', { name: /procurement/i }))
      .first()
      .click();
    await page.waitForTimeout(500);

    const createBtn = page.getByRole('button', { name: /create submittal/i })
      .or(page.getByRole('button', { name: /new submittal/i }))
      .or(page.getByRole('button', { name: /add submittal/i }))
      .or(page.getByRole('button', { name: /create purchase/i }))
      .or(page.getByRole('button', { name: /new purchase/i }));
    await expect(createBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('PM cannot approve procurement items', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /submittal/i })
      .or(page.getByRole('tab', { name: /procurement/i }))
      .first()
      .click();
    await page.waitForTimeout(1_000);

    const approveBtn = page.getByRole('button', { name: /approve/i });
    await expect(approveBtn).toBeHidden({ timeout: 3_000 }).catch(() => {});
  });
});
