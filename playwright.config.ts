import { defineConfig, devices } from '@playwright/test';

const studentUrl = new URL(process.env.STUDENT_URL ?? 'http://127.0.0.1:3002').origin;
const coreUrl = new URL(process.env.CORE_URL ?? 'http://127.0.0.1:4100').origin;
const visitorUrl = new URL(process.env.VISITOR_URL ?? 'http://127.0.0.1:3000').origin;

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: true,
  globalSetup: './tools/playwright/global-setup.ts',
  outputDir: 'test-results/artifacts',
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  retries: process.env.CI ? 1 : 0,
  testDir: './tools/playwright',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: studentUrl,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'pnpm --filter @showcase/core dev',
      cwd: '.',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: new URL('/v1/health/ready', coreUrl).toString(),
    },
    {
      command: 'pnpm --filter @showcase/student dev',
      cwd: '.',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: new URL('/health', studentUrl).toString(),
    },
    {
      command: 'pnpm --filter @showcase/visitor dev',
      cwd: '.',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: new URL('/health', visitorUrl).toString(),
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
