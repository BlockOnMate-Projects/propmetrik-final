import { test as base, expect, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

/**
 * 15 — Marketplace → Deal Pipeline E2E
 *
 * Tests the complete flow:
 *   1. Public marketplace shows CRM/PM properties
 *   2. Buyer clicks a property → lands on /apply/[token]
 *   3. Buyer fills out the inquiry form (CRM sale property)
 *   4. Inquiry auto-creates a CRM contact + deal
 *   5. Agent logs in, navigates to deals, verifies the new deal appears
 */

// Auth fixture (same as other specs)
const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const email = process.env.TEST_USER_EMAIL!;
    const password = process.env.TEST_USER_PASSWORD!;

    if (!email || !password) {
      throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env.test');
    }

    await page.goto(`${baseUrl}/login`);
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });

    await use(page);
  },
});

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_BASE = process.env.TEST_API_URL || 'http://localhost:4000';

// Generate unique buyer details per test run to avoid collisions
const uniqueId = Date.now().toString(36).slice(-5);
const BUYER = {
  first_name: `E2EBuyer`,
  last_name: `Test${uniqueId}`,
  phone: `+23324${Math.floor(1000000 + Math.random() * 9000000)}`,
  email: `e2ebuyer.${uniqueId}@test.example.com`,
  message: 'Automated E2E test — marketplace to deal pipeline inquiry',
};

test.describe('Marketplace → Deal Pipeline — Full Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  let propertyToken: string; // captured from marketplace
  let propertyTitle: string;
  let dealReference: string; // returned from the inquiry submission

  // ──────────────── 1. Public Marketplace ────────────────

  test('1 — marketplace page loads with properties', async ({ page }) => {
    await page.goto(`${BASE}/marketplace`);

    // Wait for the heading
    const heading = page.locator('h1').filter({ hasText: /discover your dream property/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Wait for at least one property card in the grid
    const cards = page.locator('.grid > div').filter({ has: page.locator('h3') });
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    await page.screenshot({ path: 'test-results/marketplace-listing.png' });
  });

  test('2 — clicking a sale property navigates to /apply/[token]', async ({ page }) => {
    await page.goto(`${BASE}/marketplace`);

    // Wait for cards
    const saleCard = page.locator('.grid > div').filter({ hasText: /for sale/i }).first();
    await expect(saleCard).toBeVisible({ timeout: 15_000 });

    // Capture the property title before clicking
    propertyTitle = (await saleCard.locator('h3').textContent()) || '';

    // Click the card — navigates to /apply/TOKEN
    await saleCard.click();
    await page.waitForURL('**/apply/**', { timeout: 15_000 });

    // Capture the token from the URL
    const url = page.url();
    propertyToken = url.split('/apply/')[1]?.split('?')[0] || '';
    expect(propertyToken.length).toBeGreaterThan(10);

    // Property detail page should show the title
    const detailHeading = page.locator('h1');
    await expect(detailHeading).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'test-results/marketplace-property-detail.png' });
  });

  // ──────────────── 2. Inquiry Form ────────────────

  test('3 — property detail page shows inquiry form for sale property', async ({ page }) => {
    // If we don't have a token from test 2, fetch one via API
    if (!propertyToken) {
      const res = await page.request.post(`${API_BASE}/api/v1/marketplace/search`, {
        data: { transaction_type: 'sale', size: 1 },
      });
      const body = await res.json();
      propertyToken = body.properties?.[0]?.permanent_link_token || '';
      propertyTitle = body.properties?.[0]?.title || '';
    }

    await page.goto(`${BASE}/apply/${propertyToken}`);

    // The inquiry form should be visible (rendered by ApplicationForm component)
    const formHeading = page.getByText(/interested in this property/i);
    await expect(formHeading).toBeVisible({ timeout: 15_000 });

    // Form fields should be present
    await expect(page.locator('#first_name')).toBeVisible();
    await expect(page.locator('#last_name')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();

    await page.screenshot({ path: 'test-results/marketplace-inquiry-form.png' });
  });

  test('4 — inquiry form validates required fields', async ({ page }) => {
    if (!propertyToken) {
      const res = await page.request.post(`${API_BASE}/api/v1/marketplace/search`, {
        data: { transaction_type: 'sale', size: 1 },
      });
      const body = await res.json();
      propertyToken = body.properties?.[0]?.permanent_link_token || '';
    }

    await page.goto(`${BASE}/apply/${propertyToken}`);
    await expect(page.getByText(/interested in this property/i)).toBeVisible({ timeout: 15_000 });

    // Click submit without filling anything
    const submitButton = page.getByRole('button', { name: /express interest/i });
    await submitButton.click();

    // Either browser native validation prevents submission (required inputs)
    // or our custom error message appears
    const firstNameInput = page.locator('#first_name');
    const isInvalid = await firstNameInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );

    if (isInvalid) {
      // Native HTML5 validation kicked in — form was NOT submitted
      expect(isInvalid).toBe(true);
    } else {
      // Custom validation error should show
      const error = page.getByText(/please fill in your name and phone/i);
      await expect(error).toBeVisible({ timeout: 5_000 });
    }

    await page.screenshot({ path: 'test-results/marketplace-inquiry-validation.png' });
  });

  test('5 — submitting inquiry form creates deal successfully', async ({ page }) => {
    if (!propertyToken) {
      const res = await page.request.post(`${API_BASE}/api/v1/marketplace/search`, {
        data: { transaction_type: 'sale', size: 1 },
      });
      const body = await res.json();
      propertyToken = body.properties?.[0]?.permanent_link_token || '';
      propertyTitle = body.properties?.[0]?.title || '';
    }

    await page.goto(`${BASE}/apply/${propertyToken}`);
    await expect(page.getByText(/interested in this property/i)).toBeVisible({ timeout: 15_000 });

    // Fill the inquiry form
    await page.locator('#first_name').fill(BUYER.first_name);
    await page.locator('#last_name').fill(BUYER.last_name);
    await page.locator('#phone').fill(BUYER.phone);
    await page.locator('#email').fill(BUYER.email);
    await page.locator('#message').fill(BUYER.message);

    // Submit
    const submitButton = page.getByRole('button', { name: /express interest/i });
    await submitButton.click();

    // Wait for success state
    const successHeading = page.getByText(/inquiry submitted/i);
    await expect(successHeading).toBeVisible({ timeout: 15_000 });

    // Capture the deal reference
    const refText = page.getByText(/reference:/i);
    await expect(refText).toBeVisible({ timeout: 5_000 });
    const refContent = await refText.textContent();
    dealReference = refContent?.replace(/reference:\s*/i, '').trim() || '';
    expect(dealReference).toMatch(/DEAL-/);

    await page.screenshot({ path: 'test-results/marketplace-inquiry-submitted.png' });
  });

  // ──────────────── 3. Agent Dashboard Verification ────────────────

  test('6 — inquiry created a deal with correct value (API verification)', async ({ authenticatedPage: page }) => {
    // Use the authenticated page's context to hit the CRM API
    const response = await page.request.get('/api/crm/deals?search=' + encodeURIComponent(BUYER.first_name));
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const deals = body.deals || body.data || body;
    const ourDeal = (Array.isArray(deals) ? deals : []).find(
      (d: any) => d.title?.includes(BUYER.first_name) && d.title?.includes(BUYER.last_name)
    );

    expect(ourDeal).toBeTruthy();
    expect(parseFloat(ourDeal.deal_value)).toBeGreaterThan(0);
    expect(ourDeal.deal_status).toBe('active');
    // Deal should have marketplace tag
    const tags = ourDeal.tags || [];
    expect(tags).toContain('marketplace');
  });

  test('7 — buyer contact was created from marketplace inquiry', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals/contacts');

    // Wait for contacts page to load
    const searchInput = page.getByPlaceholder(/search contacts/i);
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    // Search for the buyer by first name
    await searchInput.fill(BUYER.first_name);
    await page.waitForTimeout(2000); // Allow server-side search

    // The buyer contact card should appear with first + last name
    const buyerName = `${BUYER.first_name} ${BUYER.last_name}`;
    const contactCard = page.locator('h4').filter({ hasText: buyerName }).first();
    await expect(contactCard).toBeVisible({ timeout: 10_000 });

    // Verify buyer email is shown on the card
    await expect(page.getByText(BUYER.email).first()).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/marketplace-buyer-contact.png' });
  });

  test('8 — deal metrics show non-zero pipeline value', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/deals');

    const heading = page.locator('h1').filter({ hasText: 'Deals' });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Pipeline Value metric should NOT be $0.00
    const pipelineValue = page.getByText(/pipeline value/i);
    await expect(pipelineValue).toBeVisible({ timeout: 10_000 });

    // Get the value text from the metrics card
    const metricsSection = pipelineValue.locator('..');
    const valueText = await metricsSection.textContent();
    // Should contain a non-zero value
    expect(valueText).not.toContain('$0.00');
    expect(valueText).not.toContain('GHS 0');

    await page.screenshot({ path: 'test-results/marketplace-deal-metrics.png' });
  });
});
