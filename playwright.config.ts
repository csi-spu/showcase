import { defineConfig, devices } from '@playwright/test';

const studentUrl = new URL(process.env.STUDENT_URL ?? 'http://127.0.0.1:3002').origin;
const adminUrl = new URL(process.env.ADMIN_URL ?? 'http://127.0.0.1:3001').origin;
const coreUrl = new URL(process.env.CORE_URL ?? 'http://127.0.0.1:4100').origin;
const mediaProviderUrl = new URL(process.env.MEDIA_PROVIDER_URL ?? 'http://127.0.0.1:4191').origin;
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
    screenshot: 'off',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'node --experimental-strip-types tools/playwright/local-media-provider.ts',
      cwd: '.',
      timeout: 120_000,
      url: new URL('/health', mediaProviderUrl).toString(),
    },
    {
      command: 'pnpm --filter @showcase/core dev',
      cwd: '.',
      timeout: 120_000,
      url: new URL('/v1/health/ready', coreUrl).toString(),
    },
    {
      command: 'pnpm --filter @showcase/student dev',
      cwd: '.',
      timeout: 120_000,
      url: new URL('/health', studentUrl).toString(),
    },
    {
      command: 'pnpm --filter @showcase/admin dev',
      cwd: '.',
      timeout: 120_000,
      url: new URL('/health', adminUrl).toString(),
    },
    {
      command: 'pnpm --filter @showcase/visitor dev',
      cwd: '.',
      timeout: 120_000,
      url: new URL('/health', visitorUrl).toString(),
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
