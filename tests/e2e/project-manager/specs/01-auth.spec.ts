import { test, expect } from '../fixtures/auth.fixture';

test.describe('Project Manager — Authentication & Session', () => {

  test('can log in with valid credentials and reach dashboard', async ({ authenticatedPage: page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('displays the correct role badge after login', async ({ authenticatedPage: page }) => {
    // The TopNav shows role badge like "PROJECT MANAGER"
    const roleBadge = page.locator('text=/project.manager/i').first();
    await expect(roleBadge).toBeVisible({ timeout: 5_000 });
  });

  test('shows Projects tab in navigation', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('link', { name: /projects/i }).first()).toBeVisible();
  });

  test('shows E-Sign tab in navigation', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('link', { name: /e-sign/i }).first()).toBeVisible();
  });

  test('does NOT show Admin tab in navigation', async ({ authenticatedPage: page }) => {
    // Admin tab should be hidden for project_manager role
    const adminLinks = page.getByRole('link', { name: /^admin$/i });
    await expect(adminLinks).toHaveCount(0);
  });

  test('does NOT show Valuations tab in navigation', async ({ authenticatedPage: page }) => {
    const valuationLinks = page.getByRole('link', { name: /^valuations$/i });
    await expect(valuationLinks).toHaveCount(0);
  });

  test('does NOT show Deals tab in navigation', async ({ authenticatedPage: page }) => {
    const dealLinks = page.getByRole('link', { name: /^deals$/i });
    await expect(dealLinks).toHaveCount(0);
  });
});
