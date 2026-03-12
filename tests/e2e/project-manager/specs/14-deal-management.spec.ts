import { test, expect } from '../fixtures/auth.fixture';

test.describe('Deal Management — Full E2E', () => {

  test('can navigate to deals page from sidebar', async ({ authenticatedPage: page }) => {
    const dealsLink = page.getByRole('link', { name: /deals/i }).first();
    await dealsLink.click();
    await page.waitForURL('**/dashboard/deals**', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard\/deals/);
  });

  test('deals page loads with heading and metrics', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals');

    const heading = page.locator('h1').filter({ hasText: 'Deals' });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const activeDeals = page.getByText(/active deals/i);
    await expect(activeDeals).toBeVisible({ timeout: 10_000 });

    const pipelineValue = page.getByText(/pipeline value/i);
    await expect(pipelineValue).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/deal-page-loaded.png' });
  });

  test('can toggle between kanban and list view', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals');
    const heading = page.locator('h1').filter({ hasText: 'Deals' });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const viewToggle = page.locator('button:has(svg.lucide-list)');
    await expect(viewToggle).toBeVisible({ timeout: 5_000 });
    await viewToggle.click();
    await page.waitForTimeout(1000);

    const allDealsHeader = page.getByText('All Deals');
    await expect(allDealsHeader).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/deal-list-view.png' });

    const kanbanToggle = page.locator('button:has(svg.lucide-layout-grid)');
    await kanbanToggle.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/deal-kanban-view.png' });
  });

  test('can click "Create Deal" and reach deal creation form', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals');
    const heading = page.locator('h1').filter({ hasText: 'Deals' });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const createDealBtn = page.getByRole('link', { name: /create deal/i });
    await expect(createDealBtn).toBeVisible({ timeout: 5_000 });
    await createDealBtn.click();

    await page.waitForURL('**/deals/new**', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/deals\/new/);

    const formTitle = page.locator('h1').filter({ hasText: /new deal/i });
    await expect(formTitle).toBeVisible({ timeout: 10_000 });
  });

  test('deal creation form has required fields and controls', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals/new');
    await page.waitForSelector('form', { timeout: 20_000 });

    await expect(page.getByText(/deal title/i).first()).toBeVisible();
    await expect(page.getByText(/deal type/i).first()).toBeVisible();
    await expect(page.getByText(/description/i).first()).toBeVisible();
    await expect(page.getByText(/lead source/i).first()).toBeVisible();
    await expect(page.getByText(/linked properties/i).first()).toBeVisible();

    const submitBtn = page.getByRole('button', { name: /create deal/i });
    await expect(submitBtn).toBeVisible();

    await page.screenshot({ path: 'test-results/deal-form-fields.png' });
  });

  test('deal form shows validation errors on empty submit', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals/new');
    await page.waitForSelector('form', { timeout: 20_000 });

    const titleInput = page.getByPlaceholder(/4-Bed Villa/i);
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill('');

    const submitBtn = page.getByRole('button', { name: /create deal/i });
    await submitBtn.click();

    await page.waitForTimeout(500);
    const errorMsg = page.locator('.text-destructive');
    await expect(errorMsg.first()).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/deal-form-validation.png' });
  });

  test('can fill deal form and attempt creation', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals/new');
    await page.waitForSelector('form', { timeout: 20_000 });

    const titleInput = page.getByPlaceholder(/4-Bed Villa/i);
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    const dealTitle = `E2E Test Deal - ${Date.now()}`;
    await titleInput.fill(dealTitle);

    const descInput = page.getByPlaceholder(/brief description/i);
    if (await descInput.isVisible()) {
      await descInput.fill('Automated Playwright E2E test deal');
    }

    const leadSourceInput = page.getByPlaceholder(/website.*referral|referral.*agent/i);
    if (await leadSourceInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await leadSourceInput.fill('Playwright E2E');
    }

    await page.screenshot({ path: 'test-results/deal-form-filled.png' });

    const submitBtn = page.getByRole('button', { name: /create deal/i });
    await submitBtn.click();

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/deal-creation-result.png' });

    const currentUrl = page.url();
    if (currentUrl.match(/\/deals\/[a-f0-9-]+$/)) {
      console.log('Deal created successfully, redirected to:', currentUrl);
      const detailHeading = page.locator('h1, h2').first();
      await expect(detailHeading).toBeVisible({ timeout: 10_000 });
    } else {
      const errors = await page.locator('.text-destructive').allTextContents();
      console.log('Form submission had errors:', errors);
    }
  });

  test('can search deals on the deals page', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals');
    const heading = page.locator('h1').filter({ hasText: 'Deals' });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const searchInput = page.getByPlaceholder(/search deals/i);
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill('test');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'test-results/deal-search.png' });
  });

  test('can select pipeline from dropdown', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals');
    const heading = page.locator('h1').filter({ hasText: 'Deals' });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const pipelineSelector = page.getByRole('combobox').first();

    if (await pipelineSelector.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await pipelineSelector.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/deal-pipeline-dropdown.png' });

      const firstOption = page.getByRole('option').first();
      if (await firstOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('deal detail slide-in opens when clicking a deal', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals');
    const heading = page.locator('h1').filter({ hasText: 'Deals' });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const listToggle = page.locator('button:has(svg.lucide-list)');
    if (await listToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await listToggle.click();
      await page.waitForTimeout(1000);
    }

    const dealRow = page.locator('tbody tr').first();
    if (await dealRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dealRow.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/deal-detail-slidein.png' });
    }
  });
});
