import { spawnSync } from 'node:child_process';
import { assertLocalE2EEnvironment } from './environment.ts';
import { sanitizeSensitiveArtifacts } from './sensitive-artifacts.ts';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const localDefaults: Record<string, string> = {
  APP_ENV: 'test',
  ADMIN_URL: 'http://127.0.0.1:3001',
  AUTH_IDENTITY_SECRET: 'local-development-only-identity-secret',
  CORE_URL: 'http://127.0.0.1:4100',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  E2E_LOCAL_ONLY: '1',
  MEDIA_PROVIDER_URL: 'http://127.0.0.1:4191',
  STUDENT_URL: 'http://127.0.0.1:3002',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  VISITOR_URL: 'http://127.0.0.1:3000',
};

const requestedEnvironment: Record<string, string | undefined> = {
  ...localDefaults,
  ...process.env,
  APP_ENV: 'test',
  E2E_LOCAL_ONLY: '1',
  NODE_ENV: 'development',
};
if (['production', 'staging'].includes(process.env.APP_ENV ?? '')) {
  fail('E2E_SETUP_UNSAFE_TARGET: production and staging modes are not allowed');
}

try {
  assertLocalE2EEnvironment(requestedEnvironment, { requireCredentials: false });
  run(
    'pnpm',
    ['exec', 'supabase', 'start'],
    requestedEnvironment,
    'E2E_SETUP_SUPABASE_UNAVAILABLE',
  );

  const statusOutput = runWithOutput(
    'pnpm',
    ['exec', 'supabase', 'status', '-o', 'env'],
    requestedEnvironment,
    'E2E_SETUP_SUPABASE_UNAVAILABLE',
  );
  const status = parseStatusEnvironment(statusOutput);
  const environment: Record<string, string | undefined> = {
    ...requestedEnvironment,
    DATABASE_URL: status.DB_URL ?? requestedEnvironment.DATABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_URL: status.API_URL ?? requestedEnvironment.SUPABASE_URL,
    MEDIA_PROVIDER_URL: requestedEnvironment.MEDIA_PROVIDER_URL,
    ADMIN_URL: requestedEnvironment.ADMIN_URL,
  };
  assertLocalE2EEnvironment(environment);

  run(
    'pnpm',
    ['exec', 'supabase', 'db', 'reset', '--local'],
    environment,
    'E2E_SETUP_DATABASE_RESET_FAILED',
  );
  run(
    'node',
    ['--experimental-strip-types', '--test', 'tools/playwright/fixtures.integration.ts'],
    environment,
    'E2E_SETUP_FIXTURE_INTEGRATION_FAILED',
    true,
  );

  const requestedArgs = process.argv.slice(2);
  const isDebug = requestedArgs.includes('--debug');
  const isHeaded = requestedArgs.includes('--headed');
  const args = requestedArgs.filter((argument) => !['--debug', '--headed'].includes(argument));
  if (isDebug) {
    environment.PWDEBUG = '1';
  }
  if (isHeaded) {
    args.push('--headed');
  }
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...args], {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error !== undefined) fail('E2E_SETUP_PLAYWRIGHT_UNAVAILABLE');
  const removedUnsafeArtifacts = sanitizeSensitiveArtifacts({
    artifactDirectories: ['test-results', 'playwright-report'],
    knownValues: [
      environment.AUTH_IDENTITY_SECRET,
      environment.DATABASE_URL,
      environment.SUPABASE_PUBLISHABLE_KEY,
      environment.SUPABASE_SECRET_KEY,
    ].filter((value): value is string => value !== undefined),
  });
  if (removedUnsafeArtifacts > 0) fail('E2E_ARTIFACT_SENSITIVE_DATA_DETECTED');
  process.exitCode = result.status ?? 1;
} catch (error: unknown) {
  fail(error instanceof Error ? error.message : 'E2E_SETUP_FAILED');
}

function run(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
  errorCode: string,
  isOutputVisible = false,
): void {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env,
    stdio: isOutputVisible ? 'inherit' : 'ignore',
  });
  if (result.error !== undefined || result.status !== 0) fail(errorCode);
}

function runWithOutput(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
  errorCode: string,
): string {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) fail(errorCode);
  return result.stdout;
}

function parseStatusEnvironment(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/u)) {
    const match = /^(API_URL|DB_URL|ANON_KEY|SERVICE_ROLE_KEY)=(.*)$/u.exec(line.trim());
    if (match === null) continue;
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) continue;
    values[key] = value.replace(/^['"]|['"]$/gu, '');
  }
  if (
    values.API_URL === undefined ||
    values.DB_URL === undefined ||
    values.SERVICE_ROLE_KEY === undefined
  ) {
    throw new Error('E2E_SETUP_SUPABASE_UNAVAILABLE: local status did not expose required targets');
  }
  if (values.ANON_KEY === undefined) {
    throw new Error('E2E_SETUP_SUPABASE_UNAVAILABLE: local publishable key is missing');
  }
  return values;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
  return undefined as never;
}
