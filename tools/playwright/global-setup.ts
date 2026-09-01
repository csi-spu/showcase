import { spawn, type ChildProcess } from 'node:child_process';
import type { FullConfig } from '@playwright/test';
import postgres from 'postgres';
import { assertLocalE2EEnvironment } from './environment.ts';

export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  const environment = assertLocalE2EEnvironment({
    APP_ENV: process.env.APP_ENV,
    ADMIN_URL: process.env.ADMIN_URL,
    API_KEY: process.env.API_KEY,
    CORE_URL: process.env.CORE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    E2E_LOCAL_ONLY: process.env.E2E_LOCAL_ONLY,
    MEDIA_PROVIDER_URL: process.env.MEDIA_PROVIDER_URL,
    STUDENT_URL: process.env.STUDENT_URL,
    VISITOR_URL: process.env.VISITOR_URL,
  });
  const processor = startMediaProcessor();
  try {
    await prepareWorkLifecyclePreconditions(environment.databaseUrl);
    const project = config.projects[0];
    const baseURL = project?.use.baseURL;
    await Promise.all([
      waitForService(new URL('/health', environment.adminUrl), 'ADMIN'),
      waitForService(new URL('/v1/health/ready', environment.coreUrl), 'CORE'),
      waitForService(new URL('/health', environment.mediaProviderUrl), 'MEDIA_PROVIDER'),
      waitForService(new URL('/health', environment.studentUrl), 'STUDENT'),
      waitForService(new URL('/health', environment.visitorUrl), 'VISITOR'),
    ]);
    if (baseURL !== undefined && baseURL !== environment.studentUrl) {
      throw new Error('E2E_SETUP_CONFIGURATION_MISMATCH: Student base URL is not local');
    }
    if (processor.exitCode !== null) {
      throw new Error('E2E_SETUP_MEDIA_PROCESSOR_UNAVAILABLE: processor exited during setup');
    }
  } catch (error: unknown) {
    stopChild(processor);
    throw error;
  }
  return async () => stopChild(processor);
}

async function prepareWorkLifecyclePreconditions(databaseUrl: string): Promise<void> {
  const database = postgres(databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    prepare: true,
  });
  try {
    await database`delete from private.authentication_rate_limits`;
    await database`delete from private.attribution_source_lookup_rate_limits`;
  } catch (error: unknown) {
    throw new Error('E2E_SETUP_WORK_PRECONDITIONS_FAILED', { cause: error });
  } finally {
    await database.end({ timeout: 5 });
  }
}

function startMediaProcessor(): ChildProcess {
  return spawn('pnpm', ['--filter', '@showcase/core', 'media:dev'], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: process.env,
    stdio: 'ignore',
  });
}

function stopChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') child.kill('SIGTERM');
  else process.kill(-child.pid, 'SIGTERM');
}

async function waitForService(url: URL, service: string): Promise<void> {
  const deadline = Date.now() + 120_000;
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
