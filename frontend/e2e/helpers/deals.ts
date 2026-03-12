import { Page, expect } from '@playwright/test';

export interface DealFormData {
  title: string;
  description?: string;
  dealType: 'Sale' | 'Rental' | 'Lease';
  dealValue?: string;
  probability?: string;
  expectedCloseDate?: string; // ISO format YYYY-MM-DD
  leadSource?: string;
  // Contact and agent are selected from dropdowns
}

/**
 * Fill and submit the new deal form.
 * Assumes the page is already on /dashboard/deals/new
 */
export async function createDeal(page: Page, data: DealFormData) {
  // Fill title
  await page.fill('input[name="title"], input[placeholder*="title" i]', data.title);

  // Fill description if provided
  if (data.description) {
    await page.fill(
      'textarea[name="description"], textarea[placeholder*="description" i]',
      data.description
    );
  }

  // Select deal type
  const dealTypeSelect = page.locator('select, [role="combobox"]').filter({ hasText: /sale|rental|lease/i }).first();
  if (await dealTypeSelect.isVisible()) {
    await dealTypeSelect.selectOption({ label: data.dealType });
  }

  // Fill deal value
  if (data.dealValue) {
    const valueInput = page.locator('input[name="dealValue"], input[placeholder*="value" i]').first();
    await valueInput.fill(data.dealValue);
  }

  // Fill probability
  if (data.probability) {
    const probInput = page.locator('input[name="probability"], input[placeholder*="probability" i]').first();
    await probInput.fill(data.probability);
  }

  // Set expected close date via JS (avoids date picker issues)
  if (data.expectedCloseDate) {
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.evaluate((el: HTMLInputElement, val: string) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, data.expectedCloseDate);
  }

  // Select lead source if provided
  if (data.leadSource) {
    const leadSourceSelect = page.locator('select[name="leadSource"]').first();
    if (await leadSourceSelect.isVisible()) {
      await leadSourceSelect.selectOption({ label: data.leadSource });
    }
  }

  // Select first available contact
  const contactDropdown = page.locator('[class*="contact"] select, select[name*="contact"]').first();
  if (await contactDropdown.isVisible()) {
    const options = await contactDropdown.locator('option').all();
    if (options.length > 1) {
      await contactDropdown.selectOption({ index: 1 });
    }
  }

  // Select first available agent
  const agentDropdown = page.locator('[class*="agent"] select, select[name*="agent"]').first();
  if (await agentDropdown.isVisible()) {
    const options = await agentDropdown.locator('option').all();
    if (options.length > 1) {
      await agentDropdown.selectOption({ index: 1 });
    }
  }

  // Submit form
  await page.click('button[type="submit"], button:has-text("Create Deal")');

  // Wait for navigation to deal detail page
  await page.waitForURL(/\/dashboard\/deals\/[a-f0-9-]+$/, { timeout: 15000 });

  // Extract deal ID from URL
  const url = page.url();
  const dealId = url.split('/deals/')[1];
  return dealId;
}

/**
 * Advance a deal to the next pipeline stage via UI.
 * Clicks the target stage pill → fills optional note → confirms.
 */
export async function advanceDealStageViaUI(
  page: Page,
  targetStageName: string,
  note?: string
) {
  // Find and click the target stage pill
  const stagePill = page.locator(`text="${targetStageName}"`).first();
  await stagePill.scrollIntoViewIfNeeded();
  await stagePill.click();

  // Wait for the "Change Deal Stage" dialog
  const dialog = page.locator('[role="dialog"], [class*="modal"]').filter({
    hasText: /change deal stage|update stage/i,
  });
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Add optional note
  if (note) {
    const noteInput = dialog.locator('textarea, input[type="text"]').first();
    if (await noteInput.isVisible()) {
      await noteInput.fill(note);
    }
  }

  // Click Update Stage / confirm button
  await dialog.getByRole('button', { name: /update stage|confirm/i }).click();

  // Wait for dialog to close
  await expect(dialog).toBeHidden({ timeout: 5000 });
}

/**
 * Advance a deal stage via the API (faster for bulk transitions).
 */
export async function advanceDealStageViaAPI(
  page: Page,
  dealId: string,
  stageId: string,
  notes?: string
) {
  const response = await page.request.put(`/api/crm/deals/${dealId}/stage`, {
    data: {
      stage_id: stageId,
      notes: notes || `Automated stage transition to ${stageId}`,
    },
  });
  return response;
}

/**
 * Get all pipeline stages for a given pipeline ID via API.
 */
export async function getPipelineStages(page: Page, pipelineId: string) {
  const response = await page.request.get(`/api/crm/pipelines/${pipelineId}`);
  const data = await response.json();
  const stages = (data.stages || data.data?.stages || []).map(
    (s: { id: string; name?: string; stage_name?: string; display_order?: number }) => ({
      id: s.id,
      name: s.name || s.stage_name,
      order: s.display_order,
    })
  );
  return stages.sort(
    (a: { order: number }, b: { order: number }) => (a.order || 0) - (b.order || 0)
  );
}

/**
 * Add a quick note to the deal timeline.
 */
export async function addDealNote(page: Page, noteText: string) {
  const noteInput = page.locator('input[placeholder*="quick note" i]').first();
  await noteInput.fill(noteText);
  await page.click('button:has-text("Add")');
  await page.waitForTimeout(1000);
}

/**
 * Mark a deal as Won with a final value.
 */
export async function markDealAsWon(page: Page, finalValue: string) {
  await page.click('button:has-text("Won")');
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /mark deal as won/i });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.locator('input[type="number"], input[placeholder*="value" i]').fill(finalValue);
  await dialog.getByRole('button', { name: /mark as won/i }).click();
  await expect(dialog).toBeHidden({ timeout: 5000 });
}

/**
 * Mark a deal as Lost with an optional reason.
 */
export async function markDealAsLost(page: Page, reason?: string) {
  await page.click('button:has-text("Lost")');
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /mark deal as lost/i });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  if (reason) {
    await dialog.locator('textarea, input[type="text"]').first().fill(reason);
  }
  await dialog.getByRole('button', { name: /mark as lost/i }).click();
  await expect(dialog).toBeHidden({ timeout: 5000 });
}

/**
 * Generate a document from a template.
 */
export async function generateDocument(page: Page, templateName: string) {
  await page.click('text=Generate');
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /generate document/i });
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Click the template
  await dialog.getByText(templateName, { exact: false }).click();

  // Click Generate Document button
  await dialog.getByRole('button', { name: /generate document/i }).click();

  // Wait for success message
  await expect(dialog.getByText(/generated successfully/i)).toBeVisible({ timeout: 15000 });

  // Close the dialog
  await dialog.getByRole('button', { name: /close/i }).click();
}
