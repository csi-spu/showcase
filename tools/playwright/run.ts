import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { assertLocalE2EEnvironment } from './environment.ts';
import { sanitizeSensitiveArtifacts } from './sensitive-artifacts.ts';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const POSTGRES_CONTAINER = 'showcase-e2e-postgres';
const localDefaults: Record<string, string> = {
  APP_ENV: 'test',
  ADMIN_URL: 'http://127.0.0.1:3001',
  API_KEY: 'local-development-only-shared-api-key',
  BETTER_AUTH_SECRET: 'local-development-only-better-auth-secret',
  CORE_URL: 'http://127.0.0.1:4100',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  E2E_LOCAL_ONLY: '1',
  MEDIA_PROVIDER_URL: 'http://127.0.0.1:4191',
  STUDENT_URL: 'http://127.0.0.1:3002',
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
    ['--filter', '@showcase/observability', 'build'],
    requestedEnvironment,
    'E2E_SETUP_OBSERVABILITY_BUILD_FAILED',
  );
  await ensureLocalPostgres(requestedEnvironment);
  run(
    'pnpm',
    [
      '--filter',
      '@showcase/core',
      'exec',
      'prisma',
      'migrate',
      'reset',
      '--force',
      '--skip-seed',
      '--schema',
      'prisma/schema.prisma',
    ],
    requestedEnvironment,
    'E2E_SETUP_DATABASE_RESET_FAILED',
  );
  run(
    'node',
    ['--experimental-strip-types', 'tools/playwright/prepare-database.ts'],
    requestedEnvironment,
    'E2E_SETUP_DATABASE_PREPARE_FAILED',
  );
  const environment: Record<string, string | undefined> = {
    ...requestedEnvironment,
    MEDIA_PROVIDER_URL: requestedEnvironment.MEDIA_PROVIDER_URL,
    ADMIN_URL: requestedEnvironment.ADMIN_URL,
  };
  assertLocalE2EEnvironment(environment);
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
      environment.API_KEY,
      environment.BETTER_AUTH_SECRET,
      environment.DATABASE_URL,
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

async function ensureLocalPostgres(env: Record<string, string | undefined>): Promise<void> {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl !== undefined && (await canConnect(databaseUrl))) return;

  const inspect = spawnSync(
    'docker',
    ['inspect', '--format={{.State.Running}}', POSTGRES_CONTAINER],
    { cwd: repositoryRoot, encoding: 'utf8', env },
  );
  if (inspect.status === 0) {
    if (inspect.stdout.trim() !== 'true') {
      run('docker', ['start', POSTGRES_CONTAINER], env, 'E2E_SETUP_POSTGRES_UNAVAILABLE');
    }
  } else {
    run(
      'docker',
      [
        'run',
        '--detach',
        '--name',
        POSTGRES_CONTAINER,
        '--env',
        'POSTGRES_PASSWORD=postgres',
        '--publish',
        '127.0.0.1:54322:5432',
        'postgres:17.6-alpine',
      ],
      env,
      'E2E_SETUP_POSTGRES_UNAVAILABLE',
    );
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const readiness = spawnSync(
      'docker',
      ['exec', POSTGRES_CONTAINER, 'pg_isready', '--username', 'postgres', '--dbname', 'postgres'],
      { cwd: repositoryRoot, env, stdio: 'ignore' },
    );
    if (readiness.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  fail('E2E_SETUP_POSTGRES_UNAVAILABLE');
}

function canConnect(databaseUrl: string): Promise<boolean> {
  const url = new URL(databaseUrl);
  return new Promise((resolve) => {
    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port || '5432'),
    });
    const finish = (isConnected: boolean) => {
      socket.destroy();
      resolve(isConnected);
    };
    socket.setTimeout(1_000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
  return undefined as never;
}
