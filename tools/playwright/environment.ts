import { URL } from 'node:url';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const LOCAL_DATABASE_PORT = 54322;
const LOCAL_SUPABASE_PORT = 54321;

export interface LocalE2EEnvironment {
  authIdentitySecret: string;
  databaseUrl: string;
  coreUrl: string;
  studentUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  supabaseUrl: string;
  visitorUrl: string;
}

/**
 * This guard is called before any database reset, privileged Auth request, or cleanup.
 * Keep it strict: a browser run must fail closed instead of making a best-effort remote guess.
 */
export function assertLocalE2EEnvironment(
  input: Record<string, string | undefined>,
  options: { requireCredentials?: boolean } = {},
): LocalE2EEnvironment {
  if (input.E2E_LOCAL_ONLY !== '1' || input.APP_ENV !== 'test') {
    throw new Error('E2E_SETUP_UNSAFE_TARGET: APP_ENV=test and E2E_LOCAL_ONLY=1 are required');
  }

  const databaseUrl = requireLocalDatabaseUrl(input.DATABASE_URL);
  const supabaseUrl = requireLocalHttpUrl(input.SUPABASE_URL, LOCAL_SUPABASE_PORT, 'SUPABASE_URL');
  const coreUrl = requireLocalHttpUrl(input.CORE_URL, 4100, 'CORE_URL');
  const studentUrl = requireLocalHttpUrl(input.STUDENT_URL, 3002, 'STUDENT_URL');
  const visitorUrl = requireLocalHttpUrl(input.VISITOR_URL, 3000, 'VISITOR_URL');
  const requireCredentials = options.requireCredentials ?? true;
  const supabaseSecretKey = requireCredentials
    ? requireSecret(input.SUPABASE_SECRET_KEY, 'SUPABASE_SECRET_KEY')
    : (input.SUPABASE_SECRET_KEY ?? 'local-credential-not-used-before-status');
  const supabasePublishableKey = requireCredentials
    ? requireSecret(input.SUPABASE_PUBLISHABLE_KEY, 'SUPABASE_PUBLISHABLE_KEY')
    : (input.SUPABASE_PUBLISHABLE_KEY ?? 'local-credential-not-used-before-status');
  const authIdentitySecret = requireCredentials
    ? requireSecret(input.AUTH_IDENTITY_SECRET, 'AUTH_IDENTITY_SECRET')
    : (input.AUTH_IDENTITY_SECRET ?? 'local-credential-not-used-before-status');

  return {
    authIdentitySecret,
    coreUrl,
    databaseUrl,
    studentUrl,
    supabasePublishableKey,
    supabaseSecretKey,
    supabaseUrl,
    visitorUrl,
  };
}

function requireLocalDatabaseUrl(value: string | undefined): string {
  if (value === undefined) throw new Error('E2E_SETUP_UNSAFE_TARGET: DATABASE_URL is required');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('E2E_SETUP_UNSAFE_TARGET: DATABASE_URL is malformed');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    Number(url.port || LOCAL_DATABASE_PORT) !== LOCAL_DATABASE_PORT
  ) {
    throw new Error('E2E_SETUP_UNSAFE_TARGET: DATABASE_URL must target local Postgres');
  }
  return value;
}

function requireLocalHttpUrl(value: string | undefined, port: number, name: string): string {
  if (value === undefined) throw new Error(`E2E_SETUP_UNSAFE_TARGET: ${name} is required`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`E2E_SETUP_UNSAFE_TARGET: ${name} is malformed`);
  }
  if (
    url.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    Number(url.port || port) !== port ||
    url.pathname !== '/'
  ) {
    throw new Error(`E2E_SETUP_UNSAFE_TARGET: ${name} must target local port ${port}`);
  }
  return url.origin;
}

function requireSecret(value: string | undefined, name: string): string {
  if (value === undefined || value.length < 1 || value.startsWith('replace-with-')) {
    throw new Error(`E2E_SETUP_UNSAFE_TARGET: ${name} is not configured`);
  }
  return value;
}
