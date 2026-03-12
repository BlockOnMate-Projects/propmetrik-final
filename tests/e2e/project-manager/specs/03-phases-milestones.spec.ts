import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Phases & Milestones', () => {

  test('can view phases tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /phases/i }).click();
    await page.waitForTimeout(500);
    // Should see phases content area
    await expect(page.locator('text=/phase/i').first()).toBeVisible();
  });

  test('can see Add Phase button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /phases/i }).click();
    await page.waitForTimeout(500);

    const addPhaseBtn = page.getByRole('button', { name: /add phase/i })
      .or(page.getByRole('button', { name: /new phase/i }))
      .or(page.getByRole('button', { name: /create phase/i }));
    await expect(addPhaseBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('can view milestones tab on a project', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    await page.getByRole('tab', { name: /milestones/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/milestone/i').first()).toBeVisible();
  });

  test('can see Add Milestone button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
    await page.getByRole('tab', { name: /milestones/i }).click();
    await page.waitForTimeout(500);

    const addMilestoneBtn = page.getByRole('button', { name: /add milestone/i })
      .or(page.getByRole('button', { name: /new milestone/i }))
      .or(page.getByRole('button', { name: /create milestone/i }));
    await expect(addMilestoneBtn.first()).toBeVisible({ timeout: 5_000 });
  });
});
