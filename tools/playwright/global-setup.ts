import type { FullConfig } from '@playwright/test';
import { assertLocalE2EEnvironment } from './environment.ts';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const environment = assertLocalE2EEnvironment({
    APP_ENV: process.env.APP_ENV,
    AUTH_IDENTITY_SECRET: process.env.AUTH_IDENTITY_SECRET,
    CORE_URL: process.env.CORE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    E2E_LOCAL_ONLY: process.env.E2E_LOCAL_ONLY,
    STUDENT_URL: process.env.STUDENT_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VISITOR_URL: process.env.VISITOR_URL,
  });
  const project = config.projects[0];
  const baseURL = project?.use.baseURL;
  await Promise.all([
    waitForService(new URL('/v1/health/ready', environment.coreUrl), 'CORE'),
    waitForService(new URL('/health', environment.studentUrl), 'STUDENT'),
    waitForService(new URL('/health', environment.visitorUrl), 'VISITOR'),
  ]);
  if (baseURL !== undefined && baseURL !== environment.studentUrl) {
    throw new Error('E2E_SETUP_CONFIGURATION_MISMATCH: Student base URL is not local');
  }
}

async function waitForService(url: URL, service: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The supervised webServer process may still be compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`E2E_SETUP_${service}_UNAVAILABLE: readiness endpoint did not become healthy`);
}
