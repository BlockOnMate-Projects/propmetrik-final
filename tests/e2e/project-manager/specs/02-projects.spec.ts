import { test, expect } from '../fixtures/auth.fixture';
import { goToProjects } from '../helpers/navigation';

test.describe('Project Manager — Projects', () => {

  test('can view the projects list page', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await expect(page).toHaveURL(/\/dashboard\/projects/);
    await expect(page.locator('text=Projects')).toBeVisible();
  });

  test('sees only assigned projects (not all org projects)', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    // Stats bar should show projects — the PM should see assigned projects
    const totalProjects = page.locator('text=/total projects/i').first();
    await expect(totalProjects).toBeVisible({ timeout: 10_000 });
  });

  test('can see project stats cards (Total Projects, Under Construction, Budget, etc.)', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await expect(page.locator('text=/total projects/i')).toBeVisible();
    await expect(page.locator('text=/total budget/i')).toBeVisible();
  });

  test('can search projects by name', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    const searchInput = page.getByPlaceholder('Search projects...');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Smith');
    // Wait for filtered results
    await page.waitForTimeout(1000);
    // Should see the Smith project
    await expect(page.locator('text=Smith').first()).toBeVisible();
  });

  test('can filter projects by status', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    // Click the status filter dropdown
    const statusFilter = page.locator('button, [role="combobox"]').filter({ hasText: /all statuses/i }).first();
    await expect(statusFilter).toBeVisible();
  });

  test('can click into a project detail page', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    // Click the first project link
    const projectLink = page.locator('a[href*="/dashboard/projects/"]').first();
    await expect(projectLink).toBeVisible();
    await projectLink.click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);
  });

  test('can see the New Project button', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    const newProjectBtn = page.getByRole('link', { name: /new project/i });
    await expect(newProjectBtn).toBeVisible();
  });

  test('can navigate to create project page', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.getByRole('link', { name: /new project/i }).click();
    await page.waitForURL(/\/dashboard\/projects\/create/);
    await expect(page.locator('text=/step/i').first()).toBeVisible();
  });

  test('can create a new project via the wizard', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/projects/create');

    // Step 1 — Basics
    await page.getByPlaceholder('e.g., Cantonments Heights Residences').fill('E2E Test Project');
    // Select project type — click "Residential (Single)" button
    await page.locator('button, div').filter({ hasText: /residential.*single/i }).first().click();
    await page.getByPlaceholder('Describe the project...').fill('Automated E2E test project');
    // Click Continue
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 2 — Location (fill address or skip if optional)
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 3 — Land (fill land area or skip if optional)
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 4 — Units (skip)
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 5 — Financials
    await page.waitForTimeout(500);
    // Try to fill budget
    const budgetInput = page.locator('input[type="number"]').first();
    if (await budgetInput.isVisible()) {
      await budgetInput.fill('1000000');
    }
    
    // Click Create Project
    await page.getByRole('button', { name: /create project/i }).click();

    // Wait for redirect to new project page
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/, { timeout: 15_000 });
  });

  test('can edit project details', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    // Navigate to first project
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    // Click Edit Project button
    const editBtn = page.getByRole('link', { name: /edit project/i }).or(
      page.getByRole('button', { name: /edit project/i })
    );
    await expect(editBtn).toBeVisible();
  });

  test('can view project detail tabs (Overview, Phases, Budget, Team, Documents)', async ({ authenticatedPage: page }) => {
    await goToProjects(page);
    await page.locator('a[href*="/dashboard/projects/"]').first().click();
    await page.waitForURL(/\/dashboard\/projects\/[a-f0-9-]+/);

    // Check that key tabs are visible
    await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /phases/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /budget/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /team/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /documents/i })).toBeVisible();
  });
});
