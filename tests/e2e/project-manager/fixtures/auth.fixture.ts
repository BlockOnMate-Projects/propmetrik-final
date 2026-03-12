import { test as base, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

/**
 * Fixture that provides an authenticated page for the project_manager user.
 * Logs in once per test via the NextAuth credentials flow.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const email = process.env.TEST_USER_EMAIL!;
    const password = process.env.TEST_USER_PASSWORD!;

    if (!email || !password) {
      throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env.test');
    }

    await page.goto(`${baseUrl}/login`);

    // Fill credentials
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });

    await use(page);
  },
});

export { expect } from '@playwright/test';
