import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  reporter: [
    ['html', { outputFolder: 'tests/e2e/project-manager/reports', open: 'never' }],
    ['list'],
  ],
  projects: [
    {
      name: 'project-manager',
      testDir: './tests/e2e/project-manager/specs',
    },
  ],
});
