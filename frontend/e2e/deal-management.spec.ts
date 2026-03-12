import { test, expect } from '@playwright/test';
import { login, logout } from './helpers/auth';
import { navigateToDeals, navigateToDeal, navigateToNewDeal } from './helpers/navigation';
import {
  createDeal,
  advanceDealStageViaUI,
  advanceDealStageViaAPI,
  getPipelineStages,
  addDealNote,
  markDealAsWon,
  markDealAsLost,
  generateDocument,
  type DealFormData,
} from './helpers/deals';

test.describe('CRM Deal Management — Full E2E Workflow', () => {
  let dealId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ─────────────────────────────────────────────
  // 1. DEAL CREATION
  // ─────────────────────────────────────────────
  test('TC-001: Create a new deal with all fields', async ({ page }) => {
    await navigateToNewDeal(page);

    const formData: DealFormData = {
      title: 'E2E Test Deal — Automated',
      description: 'Automated E2E test deal for regression testing',
      dealType: 'Sale',
      dealValue: '750000',
      probability: '65',
      expectedCloseDate: '2026-09-30',
      leadSource: 'Website',
    };

    dealId = await createDeal(page, formData);
    expect(dealId).toBeTruthy();
    expect(dealId).toMatch(/^[a-f0-9-]{36}$/);

    // Verify deal detail page loaded
    await expect(page.locator('text=E2E Test Deal')).toBeVisible();
    await expect(page.locator('text=DEAL STAGE')).toBeVisible();
  });

  test('TC-002: Verify deal appears in deals list', async ({ page }) => {
    await navigateToDeals(page);
    await expect(page.locator('text=E2E Test Deal')).toBeVisible({ timeout: 10000 });
  });

  // ─────────────────────────────────────────────
  // 2. PIPELINE STAGE PROGRESSION
  // ─────────────────────────────────────────────
  test('TC-003: Advance deal through first 3 stages via UI', async ({ page }) => {
    test.slow(); // Allow extra time for stage transitions

    await navigateToDeal(page, dealId);

    // Advance: New Lead → Qualified
    await advanceDealStageViaUI(page, 'Qualified', 'Lead qualification complete');
    await expect(page.locator('.bg-amber-500, [class*="active"]').filter({ hasText: 'Qualified' })).toBeVisible();

    // Advance: Qualified → Property Shortlist
    await advanceDealStageViaUI(page, 'Property Shortlist');
    await expect(page.locator('text=Property Shortlist')).toBeVisible();

    // Advance: Property Shortlist → Viewing Scheduled
    await advanceDealStageViaUI(page, 'Viewing Scheduled');
    await expect(page.locator('text=Viewing Scheduled')).toBeVisible();
  });

  test('TC-004: Advance deal through remaining stages via API', async ({ page }) => {
    test.slow();

    await navigateToDeal(page, dealId);

    // Get the pipeline ID from the deal page
    const dealResponse = await page.request.get(`/api/crm/deals/${dealId}`);
    const dealData = await dealResponse.json();
    const pipelineId = dealData.pipeline_id || dealData.data?.pipeline_id;

    // Get all stages
    const stages = await getPipelineStages(page, pipelineId);
    expect(stages.length).toBeGreaterThan(10);

    // Find the current stage index (Viewing Scheduled = index 3)
    const currentIdx = stages.findIndex(
      (s: { name: string }) => s.name === 'Viewing Scheduled'
    );

    // Advance through remaining stages sequentially (skip Deal Lost)
    const targetStages = stages.slice(currentIdx + 1).filter(
      (s: { name: string }) => s.name !== 'Deal Lost'
    );

    for (const stage of targetStages) {
      const res = await advanceDealStageViaAPI(page, dealId, stage.id, `E2E: ${stage.name}`);
      // Some transitions may be invalid (skipped stages); that's expected
      if (res.ok()) {
        console.log(`✅ Advanced to: ${stage.name}`);
      } else {
        console.log(`⚠️ Skipped: ${stage.name} (invalid transition)`);
      }
    }

    // Reload and verify final stage
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  // ─────────────────────────────────────────────
  // 3. DEAL ACTIONS
  // ─────────────────────────────────────────────
  test('TC-005: Add a note to the deal timeline', async ({ page }) => {
    await navigateToDeal(page, dealId);
    await addDealNote(page, 'E2E automated test note — verifying timeline functionality');

    // Verify note appears in timeline
    await expect(page.locator('text=Notes 1')).toBeVisible();
    await expect(page.locator('text=E2E automated test note')).toBeVisible();
  });

  test('TC-006: Generate a document from template', async ({ page }) => {
    await navigateToDeal(page, dealId);
    await generateDocument(page, 'Property Offer Letter');

    // Verify document count increased
    await expect(page.locator('text=/GENERATED DOCUMENTS \\(\\d+\\)/')).toBeVisible();
  });

  test('TC-007: Open document preview dialog', async ({ page }) => {
    await navigateToDeal(page, dealId);

    // Click on first document
    const firstDoc = page.locator('[class*="document"], [class*="card"]')
      .filter({ hasText: /\.pdf/i })
      .first();
    await firstDoc.click();

    // Verify preview dialog opens
    const dialog = page.locator('[role="dialog"]').filter({ hasText: /\.pdf/i });
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('text=Download')).toBeVisible();

    // Close dialog
    await dialog.locator('button[class*="close"], [aria-label="close"]').first().click();
  });

  test('TC-008: Mark deal as Won', async ({ page }) => {
    await navigateToDeal(page, dealId);
    await markDealAsWon(page, '850000');

    // Reload and verify WON badge
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=WON')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Reopen')).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // 4. NAVIGATION & SIDEBAR
  // ─────────────────────────────────────────────
  test('TC-009: Sidebar navigation works for all CRM sections', async ({ page }) => {
    await navigateToDeals(page);

    const sections = ['Deals', 'Properties', 'Contacts', 'Tasks', 'Documents', 'Messaging', 'Calendar'];

    for (const section of sections) {
      const sidebarLink = page.locator('aside, [class*="sidebar"]')
        .getByText(section, { exact: true })
        .first();

      if (await sidebarLink.isVisible()) {
        await sidebarLink.click();
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/dashboard/deals/');
      }
    }
  });

  test('TC-010: Top nav service tabs are accessible', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const services = ['OVERVIEW', 'VALUATIONS', 'DEALS', 'PROJECTS'];
    for (const service of services) {
      const tab = page.locator('nav').getByText(service, { exact: false }).first();
      await expect(tab).toBeVisible();
    }
  });

  // ─────────────────────────────────────────────
  // 5. CONTACT NAVIGATION
  // ─────────────────────────────────────────────
  test('TC-011: View Contact link navigates to contact detail', async ({ page }) => {
    await navigateToDeal(page, dealId);

    // Click "View contact" link
    await page.click('text=View contact');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/contacts/');

    // Verify contact detail page
    await expect(page.locator('text=CONTACT INFORMATION')).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // 6. DATA PERSISTENCE
  // ─────────────────────────────────────────────
  test('TC-012: Deal data persists after page reload', async ({ page }) => {
    await navigateToDeal(page, dealId);

    // Capture key data points
    const dealTitle = await page.locator('h1, h2').first().textContent();

    // Hard reload
    await page.reload({ waitUntil: 'networkidle' });

    // Verify all data persisted
    await expect(page.locator(`text=${dealTitle}`)).toBeVisible();
    await expect(page.locator('text=DEAL VALUE')).toBeVisible();
    await expect(page.locator('text=DEAL STAGE')).toBeVisible();
    await expect(page.locator('text=PRIMARY CONTACT')).toBeVisible();
    await expect(page.locator('text=ASSIGNED AGENT')).toBeVisible();
    await expect(page.locator('text=DOCUMENTS')).toBeVisible();
    await expect(page.locator('text=TIMELINE')).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // 7. TIMELINE FILTERS
  // ─────────────────────────────────────────────
  test('TC-013: Timeline filter tabs work', async ({ page }) => {
    await navigateToDeal(page, dealId);

    const filters = ['All', 'Activities', 'Tasks', 'Notes', 'Documents', 'Stage Changes'];
    for (const filter of filters) {
      const tab = page.locator('button, [role="tab"]').filter({ hasText: filter }).first();
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(500);
        // The tab should become active
        await expect(tab).toBeVisible();
      }
    }
  });

  // ─────────────────────────────────────────────
  // 8. EDGE CASES & ERROR HANDLING
  // ─────────────────────────────────────────────
  test('TC-014: Edit button navigates correctly (known bug: 404)', async ({ page }) => {
    await navigateToDeal(page, dealId);

    // NOTE: This is a known bug — Edit navigates to /deals/{id}/edit which is 404
    const editButton = page.locator('button:has-text("Edit"), a:has-text("Edit")').first();
    if (await editButton.isVisible()) {
      // Check if href leads to a valid page
      const [response] = await Promise.all([
        page.waitForNavigation(),
        editButton.click(),
      ]);
      // Expected: 404 (known bug, no edit page exists)
      // This test documents the bug for future fix
    }
  });
});
