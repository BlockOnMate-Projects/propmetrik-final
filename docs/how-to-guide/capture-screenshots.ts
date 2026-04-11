/**
 * PropMetrik — Comprehensive Screenshot Capture Script
 *
 * Usage:
 *   npx playwright test docs/how-to-guide/capture-screenshots.ts --headed
 *
 * Or run directly:
 *   npx tsx docs/how-to-guide/capture-screenshots.ts
 */

import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.resolve(__dirname);

// Credentials
const ADMIN_EMAIL = 'eric@cedynhq.com';
const ADMIN_PASSWORD = 'Delta0246@';
const TENANT_EMAIL = 'cedynhq@gmail.com';
const TENANT_PASSWORD = 'Delta0246@';

// ─── Helpers ────────────────────────────────────────────────
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function screenshot(page: Page, chapter: string, name: string) {
  const dir = path.join(SCREENSHOT_DIR, chapter, 'screenshots');
  ensureDir(dir);
  const filePath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  ✅ ${chapter}/${name}.png`);
  return filePath;
}

async function screenshotFullPage(page: Page, chapter: string, name: string) {
  const dir = path.join(SCREENSHOT_DIR, chapter, 'screenshots');
  ensureDir(dir);
  const filePath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  ✅ ${chapter}/${name}.png (full)`);
  return filePath;
}

async function navigateAndWait(page: Page, url: string, timeout = 15000) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout });
  } catch {
    // Fallback: just wait for load
    try {
      await page.goto(url, { waitUntil: 'load', timeout });
      await page.waitForTimeout(2000);
    } catch {
      console.log(`  ⚠️  Timeout loading ${url}, taking screenshot anyway`);
      await page.waitForTimeout(3000);
    }
  }
}

async function safeScreenshot(page: Page, chapter: string, name: string, url: string) {
  try {
    await navigateAndWait(page, url);
    await page.waitForTimeout(1500); // let animations settle
    await screenshot(page, chapter, name);
  } catch (err) {
    console.log(`  ❌ Failed: ${chapter}/${name} (${url}) — ${err}`);
  }
}

// ─── Login Flow ─────────────────────────────────────────────
async function login(page: Page, email: string, password: string) {
  console.log(`🔐 Logging in as ${email}...`);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);

  // Fill credentials
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.waitForTimeout(500);

  // Screenshot login page (before submit)
  await screenshot(page, '01-authentication', '02-login-filled');

  // Submit
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('  ✅ Login successful');
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER CAPTURE FUNCTIONS
// ═══════════════════════════════════════════════════════════

async function captureChapter01(page: Page) {
  console.log('\n📸 Chapter 1: Authentication & Onboarding');

  // Homepage
  await safeScreenshot(page, '01-authentication', '01-homepage', `${BASE}/`);

  // Login page (empty)
  await navigateAndWait(page, `${BASE}/login`);
  await page.waitForTimeout(1000);
  await screenshot(page, '01-authentication', '03-login-page');

  // Signup page
  await safeScreenshot(page, '01-authentication', '04-signup-page', `${BASE}/signup`);

  // Forgot password
  await safeScreenshot(page, '01-authentication', '05-forgot-password', `${BASE}/forgot-password`);

  // SSO login
  await safeScreenshot(page, '01-authentication', '06-sso-login', `${BASE}/login/sso`);
}

async function captureChapter02(page: Page) {
  console.log('\n📸 Chapter 2: Dashboard & Navigation');

  await safeScreenshot(page, '02-dashboard', '01-main-dashboard', `${BASE}/dashboard`);

  // Scroll down for more dashboard content
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(1000);
  await screenshot(page, '02-dashboard', '02-dashboard-market-intelligence');

  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(1000);
  await screenshot(page, '02-dashboard', '03-dashboard-bottom');

  // Profile
  await safeScreenshot(page, '02-dashboard', '04-profile', `${BASE}/dashboard/profile`);

  // Notifications
  await safeScreenshot(page, '02-dashboard', '05-notifications', `${BASE}/dashboard/notifications`);

  // Calendar
  await safeScreenshot(page, '02-dashboard', '06-calendar', `${BASE}/dashboard/calendar`);

  // Portfolio
  await safeScreenshot(page, '02-dashboard', '07-portfolio', `${BASE}/dashboard/portfolio`);
}

async function captureChapter03(page: Page) {
  console.log('\n📸 Chapter 3: Project Management');
  const ch = '03-project-management';

  await safeScreenshot(page, ch, '01-projects-list', `${BASE}/dashboard/projects`);
  await safeScreenshot(page, ch, '02-create-project', `${BASE}/dashboard/projects/create`);
  await safeScreenshot(page, ch, '03-project-schedule', `${BASE}/dashboard/projects/schedule`);
  await safeScreenshot(page, ch, '04-project-team', `${BASE}/dashboard/projects/team`);
  await safeScreenshot(page, ch, '05-project-bids', `${BASE}/dashboard/projects/bids`);
  await safeScreenshot(page, ch, '06-project-bidding', `${BASE}/dashboard/projects/bidding`);
  await safeScreenshot(page, ch, '07-rfis', `${BASE}/dashboard/projects/rfis`);
  await safeScreenshot(page, ch, '08-submittals', `${BASE}/dashboard/projects/documents`);
  await safeScreenshot(page, ch, '09-site-logs', `${BASE}/dashboard/projects/site-logs`);
  await safeScreenshot(page, ch, '10-checklists', `${BASE}/dashboard/projects/checklists`);
  await safeScreenshot(page, ch, '11-punch-lists', `${BASE}/dashboard/projects/punch-lists`);
  await safeScreenshot(page, ch, '12-safety', `${BASE}/dashboard/projects/safety`);
  await safeScreenshot(page, ch, '13-meetings', `${BASE}/dashboard/projects/meetings`);
  await safeScreenshot(page, ch, '14-drawings', `${BASE}/dashboard/projects/drawings`);
  await safeScreenshot(page, ch, '15-procurement', `${BASE}/dashboard/projects/costs`);
  await safeScreenshot(page, ch, '16-transmittals', `${BASE}/dashboard/projects/transmittals`);
  await safeScreenshot(page, ch, '17-timesheets', `${BASE}/dashboard/projects/timesheets`);
  await safeScreenshot(page, ch, '18-equipment', `${BASE}/dashboard/projects/equipment`);
  await safeScreenshot(page, ch, '19-contractors', `${BASE}/dashboard/projects/contractors`);
  await safeScreenshot(page, ch, '20-change-orders', `${BASE}/dashboard/projects/change-orders`);
  await safeScreenshot(page, ch, '21-closeout', `${BASE}/dashboard/projects/closeout`);
  await safeScreenshot(page, ch, '22-units', `${BASE}/dashboard/projects/units`);
  await safeScreenshot(page, ch, '23-cost-estimator', `${BASE}/dashboard/projects/cost-estimator`);
  await safeScreenshot(page, ch, '24-audit-log', `${BASE}/dashboard/projects/audit-log`);
  await safeScreenshot(page, ch, '25-settings', `${BASE}/dashboard/projects/settings`);
  await safeScreenshot(page, ch, '26-analytics', `${BASE}/dashboard/projects/analytics`);
  await safeScreenshot(page, ch, '27-reports', `${BASE}/dashboard/projects/reports`);
  await safeScreenshot(page, ch, '28-issues', `${BASE}/dashboard/projects/issues`);
}

async function captureChapter04(page: Page) {
  console.log('\n📸 Chapter 4: Budget & Cost Management');
  const ch = '04-budget-cost';

  await safeScreenshot(page, ch, '01-costs-overview', `${BASE}/dashboard/projects/costs`);
  await safeScreenshot(page, ch, '02-financials', `${BASE}/dashboard/projects/financials`);
  await safeScreenshot(page, ch, '03-invoices', `${BASE}/dashboard/projects/invoices`);
  await safeScreenshot(page, ch, '04-invoice-builder', `${BASE}/dashboard/projects/invoice-builder`);
  await safeScreenshot(page, ch, '05-payment-schedule', `${BASE}/dashboard/projects/payment-schedule`);
  await safeScreenshot(page, ch, '06-payment-settings', `${BASE}/dashboard/projects/payment-settings`);
}

async function captureChapter05(page: Page) {
  console.log('\n📸 Chapter 5: Property Management');
  const ch = '05-property-management';

  await safeScreenshot(page, ch, '01-pm-dashboard', `${BASE}/dashboard/property-management`);
  await safeScreenshot(page, ch, '02-properties-list', `${BASE}/dashboard/property-management/properties`);
  await safeScreenshot(page, ch, '03-add-property', `${BASE}/dashboard/property-management/properties/new`);
  await safeScreenshot(page, ch, '04-portfolios', `${BASE}/dashboard/property-management/portfolios`);
  await safeScreenshot(page, ch, '05-tenants', `${BASE}/dashboard/property-management/tenants`);
  await safeScreenshot(page, ch, '06-add-tenant', `${BASE}/dashboard/property-management/tenants/new`);
  await safeScreenshot(page, ch, '07-leases', `${BASE}/dashboard/property-management/leases`);
  await safeScreenshot(page, ch, '08-create-lease', `${BASE}/dashboard/property-management/leases/new`);
  await safeScreenshot(page, ch, '09-applications', `${BASE}/dashboard/property-management/applications`);
  await safeScreenshot(page, ch, '10-maintenance', `${BASE}/dashboard/property-management/maintenance`);
  await safeScreenshot(page, ch, '11-create-maintenance', `${BASE}/dashboard/property-management/maintenance/new`);
  await safeScreenshot(page, ch, '12-messages', `${BASE}/dashboard/property-management/messages`);
  await safeScreenshot(page, ch, '13-documents', `${BASE}/dashboard/property-management/documents`);
  await safeScreenshot(page, ch, '14-pm-financials', `${BASE}/dashboard/property-management/financials`);
  await safeScreenshot(page, ch, '15-pm-calendar', `${BASE}/dashboard/property-management/calendar`);
  await safeScreenshot(page, ch, '16-pm-reports', `${BASE}/dashboard/property-management/reports`);
  await safeScreenshot(page, ch, '17-audit', `${BASE}/dashboard/property-management/audit`);
  await safeScreenshot(page, ch, '18-pm-team', `${BASE}/dashboard/property-management/team`);
  await safeScreenshot(page, ch, '19-vendors', `${BASE}/dashboard/property-management/vendors`);
  await safeScreenshot(page, ch, '20-bulk-operations', `${BASE}/dashboard/property-management/bulk-operations`);
}

async function captureChapter06(page: Page, context: BrowserContext) {
  console.log('\n📸 Chapter 6: Tenant Portal');
  const ch = '06-tenant-portal';

  // Need a separate context for tenant login
  const tenantPage = await context.newPage();

  // Tenant login page
  await safeScreenshot(tenantPage, ch, '01-tenant-login', `${BASE}/tenant-login`);

  // Try logging in as tenant
  try {
    await tenantPage.goto(`${BASE}/tenant-login`, { waitUntil: 'networkidle', timeout: 15000 });
    await tenantPage.waitForTimeout(1000);

    // Fill tenant credentials
    const emailInput = await tenantPage.$('input[type="email"], input[name="email"]');
    const passwordInput = await tenantPage.$('input[type="password"], input[name="password"]');
    if (emailInput && passwordInput) {
      await emailInput.fill(TENANT_EMAIL);
      await passwordInput.fill(TENANT_PASSWORD);
      await screenshot(tenantPage, ch, '02-tenant-login-filled');
      await tenantPage.click('button[type="submit"]');
      await tenantPage.waitForTimeout(5000);
    }
    await screenshot(tenantPage, ch, '03-tenant-dashboard');
  } catch (err) {
    console.log(`  ⚠️  Tenant login flow issue: ${err}`);
  }

  // Tenant portal pages (using admin session to view)
  await safeScreenshot(page, ch, '04-tenant-portal-home', `${BASE}/tenant`);
  await safeScreenshot(page, ch, '05-tenant-maintenance', `${BASE}/tenant/maintenance`);
  await safeScreenshot(page, ch, '06-tenant-maintenance-new', `${BASE}/tenant/maintenance/new`);

  await tenantPage.close();
}

async function captureChapter07(page: Page) {
  console.log('\n📸 Chapter 7: Valuations');
  const ch = '07-valuations';

  await safeScreenshot(page, ch, '01-valuations-list', `${BASE}/dashboard/valuations`);
  await safeScreenshot(page, ch, '02-new-valuation', `${BASE}/dashboard/valuations/new`);
  await safeScreenshot(page, ch, '03-valuation-analytics', `${BASE}/dashboard/valuations/analytics`);
  await safeScreenshot(page, ch, '04-valuation-clients', `${BASE}/dashboard/valuations/clients`);
  await safeScreenshot(page, ch, '05-valuation-finance', `${BASE}/dashboard/valuations/finance`);
  await safeScreenshot(page, ch, '06-valuation-team', `${BASE}/dashboard/valuations/team`);
  await safeScreenshot(page, ch, '07-valuation-settings', `${BASE}/dashboard/valuations/settings`);

  // Try to capture individual valuation pages if data exists
  // Navigate to valuations list to find an existing ID
  try {
    await navigateAndWait(page, `${BASE}/dashboard/valuations`);
    await page.waitForTimeout(2000);

    // Try to click the first valuation row
    const firstRow = await page.$('table tbody tr a, [data-testid="valuation-row"], .cursor-pointer');
    if (firstRow) {
      await firstRow.click();
      await page.waitForTimeout(3000);
      const url = page.url();
      const idMatch = url.match(/valuations\/([a-zA-Z0-9-]+)/);

      if (idMatch) {
        const id = idMatch[1];
        await screenshot(page, ch, '08-valuation-detail');
        await safeScreenshot(page, ch, '09-valuation-subject', `${BASE}/dashboard/valuations/${id}/subject`);
        await safeScreenshot(page, ch, '10-valuation-property', `${BASE}/dashboard/valuations/${id}/property`);
        await safeScreenshot(page, ch, '11-valuation-market', `${BASE}/dashboard/valuations/${id}/market`);
        await safeScreenshot(page, ch, '12-valuation-comparables', `${BASE}/dashboard/valuations/${id}/comparables`);
        await safeScreenshot(page, ch, '13-valuation-income', `${BASE}/dashboard/valuations/${id}/income`);
        await safeScreenshot(page, ch, '14-valuation-cost', `${BASE}/dashboard/valuations/${id}/cost`);
        await safeScreenshot(page, ch, '15-valuation-drc', `${BASE}/dashboard/valuations/${id}/drc`);
        await safeScreenshot(page, ch, '16-valuation-hbu', `${BASE}/dashboard/valuations/${id}/hbu`);
        await safeScreenshot(page, ch, '17-valuation-floor-plan', `${BASE}/dashboard/valuations/${id}/floor-plan`);
        await safeScreenshot(page, ch, '18-valuation-rental-market', `${BASE}/dashboard/valuations/${id}/rental-market`);
        await safeScreenshot(page, ch, '19-valuation-methods', `${BASE}/dashboard/valuations/${id}/methods`);
        await safeScreenshot(page, ch, '20-valuation-reconciliation', `${BASE}/dashboard/valuations/${id}/reconciliation`);
        await safeScreenshot(page, ch, '21-valuation-profits', `${BASE}/dashboard/valuations/${id}/profits`);
        await safeScreenshot(page, ch, '22-valuation-residual', `${BASE}/dashboard/valuations/${id}/residual`);
        await safeScreenshot(page, ch, '23-valuation-report', `${BASE}/dashboard/valuations/${id}/report`);
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Could not capture individual valuation: ${err}`);
  }
}

async function captureChapter08(page: Page) {
  console.log('\n📸 Chapter 8: Deals / CRM');
  const ch = '08-deals-crm';

  await safeScreenshot(page, ch, '01-deals-list', `${BASE}/dashboard/deals`);
  await safeScreenshot(page, ch, '02-new-deal', `${BASE}/dashboard/deals/new`);
  await safeScreenshot(page, ch, '03-contacts', `${BASE}/dashboard/deals/contacts`);
  await safeScreenshot(page, ch, '04-new-contact', `${BASE}/dashboard/deals/contacts/new`);
  await safeScreenshot(page, ch, '05-agents', `${BASE}/dashboard/deals/agents`);
  await safeScreenshot(page, ch, '06-new-agent', `${BASE}/dashboard/deals/agents/new`);
  await safeScreenshot(page, ch, '07-companies', `${BASE}/dashboard/deals/companies`);
  await safeScreenshot(page, ch, '08-properties', `${BASE}/dashboard/deals/properties`);
  await safeScreenshot(page, ch, '09-pipelines', `${BASE}/dashboard/deals/pipelines`);
  await safeScreenshot(page, ch, '10-tasks', `${BASE}/dashboard/deals/tasks`);
  await safeScreenshot(page, ch, '11-targets', `${BASE}/dashboard/deals/targets`);
  await safeScreenshot(page, ch, '12-commissions', `${BASE}/dashboard/deals/commissions`);
  await safeScreenshot(page, ch, '13-drip-campaigns', `${BASE}/dashboard/deals/drip-campaigns`);
  await safeScreenshot(page, ch, '14-documents', `${BASE}/dashboard/deals/documents`);
  await safeScreenshot(page, ch, '15-messaging', `${BASE}/dashboard/deals/messaging`);
  await safeScreenshot(page, ch, '16-workflows', `${BASE}/dashboard/deals/workflows`);
  await safeScreenshot(page, ch, '17-financials', `${BASE}/dashboard/deals/financials`);
  await safeScreenshot(page, ch, '18-deal-team', `${BASE}/dashboard/deals/team`);
  await safeScreenshot(page, ch, '19-deal-analytics', `${BASE}/dashboard/deals/analytics`);

  // Try to capture a deal detail page
  try {
    await navigateAndWait(page, `${BASE}/dashboard/deals`);
    await page.waitForTimeout(2000);
    const firstDeal = await page.$('table tbody tr a, [data-testid="deal-row"], a[href*="/deals/"]');
    if (firstDeal) {
      await firstDeal.click();
      await page.waitForTimeout(3000);
      await screenshot(page, ch, '20-deal-detail');
    }
  } catch (err) {
    console.log(`  ⚠️  Could not capture deal detail: ${err}`);
  }
}

async function captureChapter09(page: Page) {
  console.log('\n📸 Chapter 9: E-Signature');
  const ch = '09-e-signature';

  await safeScreenshot(page, ch, '01-esign-list', `${BASE}/dashboard/e-sign`);
  await safeScreenshot(page, ch, '02-new-envelope', `${BASE}/dashboard/e-sign/new`);
  await safeScreenshot(page, ch, '03-templates', `${BASE}/dashboard/e-sign/templates`);
  await safeScreenshot(page, ch, '04-lease-envelope', `${BASE}/dashboard/e-sign/lease-envelope`);
  await safeScreenshot(page, ch, '05-report-envelope', `${BASE}/dashboard/e-sign/report-envelope`);
}

async function captureChapter10(page: Page) {
  console.log('\n📸 Chapter 10: Financial / Invoicing');
  const ch = '10-financial';

  await safeScreenshot(page, ch, '01-billing', `${BASE}/dashboard/billing`);
  await safeScreenshot(page, ch, '02-project-invoices', `${BASE}/dashboard/projects/invoices`);
  await safeScreenshot(page, ch, '03-project-financials', `${BASE}/dashboard/projects/financials`);
  await safeScreenshot(page, ch, '04-valuation-finance', `${BASE}/dashboard/valuations/finance`);
  await safeScreenshot(page, ch, '05-deal-financials', `${BASE}/dashboard/deals/financials`);
  await safeScreenshot(page, ch, '06-pm-financials', `${BASE}/dashboard/property-management/financials`);
}

async function captureChapter11(page: Page) {
  console.log('\n📸 Chapter 11: Data Hub & Analytics');
  const ch = '11-data-hub';

  // Analytics pages
  await safeScreenshot(page, ch, '01-analytics-main', `${BASE}/dashboard/analytics`);
  await safeScreenshot(page, ch, '02-affordability', `${BASE}/dashboard/analytics/affordability`);
  await safeScreenshot(page, ch, '03-construction', `${BASE}/dashboard/analytics/construction`);
  await safeScreenshot(page, ch, '04-forecasting', `${BASE}/dashboard/analytics/forecasting`);
  await safeScreenshot(page, ch, '05-geographic', `${BASE}/dashboard/analytics/geographic`);
  await safeScreenshot(page, ch, '06-risk', `${BASE}/dashboard/analytics/risk`);
  await safeScreenshot(page, ch, '07-short-stay', `${BASE}/dashboard/analytics/short-stay`);
  await safeScreenshot(page, ch, '08-investments', `${BASE}/dashboard/analytics/market/investments`);
  await safeScreenshot(page, ch, '09-rentals', `${BASE}/dashboard/analytics/market/rentals`);
  await safeScreenshot(page, ch, '10-ml-insights', `${BASE}/dashboard/analytics/ml`);
  await safeScreenshot(page, ch, '11-ml-features', `${BASE}/dashboard/analytics/ml/features`);
  await safeScreenshot(page, ch, '12-ml-forecasting', `${BASE}/dashboard/analytics/ml/forecasting`);
  await safeScreenshot(page, ch, '13-ml-monitoring', `${BASE}/dashboard/analytics/ml/monitoring`);

  // Data Hub pages
  await safeScreenshot(page, ch, '14-data-hub-main', `${BASE}/dashboard/admin/data-hub`);
  await safeScreenshot(page, ch, '15-data-sources', `${BASE}/dashboard/admin/data-hub/sources`);
  await safeScreenshot(page, ch, '16-data-ingestion', `${BASE}/dashboard/admin/data-hub/ingestion`);
  await safeScreenshot(page, ch, '17-data-catalog', `${BASE}/dashboard/admin/data-hub/catalog`);
  await safeScreenshot(page, ch, '18-data-quality', `${BASE}/dashboard/admin/data-hub/quality`);
  await safeScreenshot(page, ch, '19-data-lineage', `${BASE}/dashboard/admin/data-hub/lineage`);
  await safeScreenshot(page, ch, '20-data-analytics', `${BASE}/dashboard/admin/data-hub/analytics`);
  await safeScreenshot(page, ch, '21-construction-data', `${BASE}/dashboard/admin/data-hub/construction`);
  await safeScreenshot(page, ch, '22-economic-data', `${BASE}/dashboard/admin/data-hub/economic`);
  await safeScreenshot(page, ch, '23-data-insights', `${BASE}/dashboard/admin/data-hub/insights`);
  await safeScreenshot(page, ch, '24-data-performance', `${BASE}/dashboard/admin/data-hub/performance`);
  await safeScreenshot(page, ch, '25-data-jobs', `${BASE}/dashboard/admin/data-hub/jobs`);
  await safeScreenshot(page, ch, '26-data-queues', `${BASE}/dashboard/admin/data-hub/queues`);
  await safeScreenshot(page, ch, '27-pull-integrations', `${BASE}/dashboard/admin/data-hub/pull-integrations`);
  await safeScreenshot(page, ch, '28-spiders', `${BASE}/dashboard/admin/data-hub/spiders`);
  await safeScreenshot(page, ch, '29-contributions', `${BASE}/dashboard/admin/data-hub/contributions`);
  await safeScreenshot(page, ch, '30-valuation-config', `${BASE}/dashboard/admin/data-hub/valuation-config`);
  await safeScreenshot(page, ch, '31-data-settings', `${BASE}/dashboard/admin/data-hub/settings`);
}

async function captureChapter12(page: Page) {
  console.log('\n📸 Chapter 12: Integrations');
  const ch = '12-integrations';

  await safeScreenshot(page, ch, '01-integrations-main', `${BASE}/dashboard/admin/integrations`);
  await safeScreenshot(page, ch, '02-marketplace', `${BASE}/dashboard/projects/integrations-marketplace`);
  await safeScreenshot(page, ch, '03-crypto-settings', `${BASE}/dashboard/admin/crypto`);
}

async function captureChapter13(page: Page) {
  console.log('\n📸 Chapter 13: Admin & Compliance');
  const ch = '13-admin-compliance';

  await safeScreenshot(page, ch, '01-admin-dashboard', `${BASE}/dashboard/admin`);
  await safeScreenshot(page, ch, '02-rbac', `${BASE}/dashboard/admin/rbac`);
  await safeScreenshot(page, ch, '03-api-keys', `${BASE}/dashboard/admin/api-keys`);
  await safeScreenshot(page, ch, '04-api-docs', `${BASE}/dashboard/admin/api-docs`);
  await safeScreenshot(page, ch, '05-usage', `${BASE}/dashboard/admin/usage`);
  await safeScreenshot(page, ch, '06-platform-fees', `${BASE}/dashboard/admin/platform-fees`);
  await safeScreenshot(page, ch, '07-customer-success', `${BASE}/dashboard/admin/customer-success`);
  await safeScreenshot(page, ch, '08-onboarding', `${BASE}/dashboard/admin/onboarding`);
  await safeScreenshot(page, ch, '09-publications', `${BASE}/dashboard/admin/publications`);
  await safeScreenshot(page, ch, '10-publications-list', `${BASE}/dashboard/admin/publications/list`);
  await safeScreenshot(page, ch, '11-publications-new', `${BASE}/dashboard/admin/publications/new`);
  await safeScreenshot(page, ch, '12-publications-settings', `${BASE}/dashboard/admin/publications/settings`);
  await safeScreenshot(page, ch, '13-publications-analytics', `${BASE}/dashboard/admin/publications/analytics`);
  await safeScreenshot(page, ch, '14-autopilot', `${BASE}/dashboard/admin/publications/autopilot`);
  await safeScreenshot(page, ch, '15-newsletter', `${BASE}/dashboard/admin/publications/newsletter`);
  await safeScreenshot(page, ch, '16-indices', `${BASE}/dashboard/admin/publications/indices`);
}

async function captureChapter14(page: Page) {
  console.log('\n📸 Chapter 14: Reporting');
  const ch = '14-reporting';

  await safeScreenshot(page, ch, '01-project-reports', `${BASE}/dashboard/projects/reports`);
  await safeScreenshot(page, ch, '02-pm-reports', `${BASE}/dashboard/property-management/reports`);
  await safeScreenshot(page, ch, '03-valuation-analytics', `${BASE}/dashboard/valuations/analytics`);
  await safeScreenshot(page, ch, '04-deal-analytics', `${BASE}/dashboard/deals/analytics`);
  await safeScreenshot(page, ch, '05-team-analytics', `${BASE}/dashboard/analytics/team`);
  await safeScreenshot(page, ch, '06-crm-analytics', `${BASE}/dashboard/analytics/crm`);
  await safeScreenshot(page, ch, '07-management-analytics', `${BASE}/dashboard/analytics/management`);
  await safeScreenshot(page, ch, '08-valuation-leaderboard', `${BASE}/dashboard/analytics/valuations/leaderboard`);
  await safeScreenshot(page, ch, '09-sensitivity-analysis', `${BASE}/dashboard/analytics/valuations/sensitivity`);
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log('🚀 PropMetrik Screenshot Capture — Starting...\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // Retina quality
  });

  const page = await context.newPage();

  try {
    // Chapter 1: Auth pages (before login)
    await captureChapter01(page);

    // Login as admin
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Capture all dashboard chapters
    await captureChapter02(page);
    await captureChapter03(page);
    await captureChapter04(page);
    await captureChapter05(page);
    await captureChapter06(page, context);
    await captureChapter07(page);
    await captureChapter08(page);
    await captureChapter09(page);
    await captureChapter10(page);
    await captureChapter11(page);
    await captureChapter12(page);
    await captureChapter13(page);
    await captureChapter14(page);

    console.log('\n\n🎉 Screenshot capture complete!');
    console.log(`📁 Screenshots saved in: ${SCREENSHOT_DIR}`);

  } catch (err) {
    console.error('❌ Fatal error:', err);
  } finally {
    await browser.close();
  }
}

main();
