const REDACTED = '[redacted]';
const REDACTED_STUDENT_ID = '[redacted-student-id]';
const MAX_DEPTH = 10;

const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'address',
  'apikey',
  'authorization',
  'body',
  'cookie',
  'credentials',
  'email',
  'firstname',
  'formdata',
  'fullname',
  'headers',
  'lastname',
  'password',
  'passphrase',
  'phone',
  'proxyauthorization',
  'query',
  'queryparams',
  'querystring',
  'refreshtoken',
  'requestbody',
  'responsebody',
  'rosterfirstname',
  'rosterfullname',
  'rosterlastname',
  'secret',
  'session',
  'sessionid',
  'setcookie',
  'signature',
  'signingsecret',
  'studentid',
  'token',
  'username',
  'variables',
]);

const SENSITIVE_KEY_FRAGMENTS = [
  'accesstoken',
  'address',
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'email',
  'firstname',
  'fullname',
  'header',
  'lastname',
  'password',
  'passphrase',
  'phone',
  'refreshtoken',
  'requestbody',
  'responsebody',
  'searchparams',
  'secret',
  'sessionid',
  'signature',
  'studentid',
  'token',
  'username',
] as const;

const URL_KEYS = new Set(['from', 'href', 'referer', 'referrer', 'to', 'url']);

type MutableRecord = Record<string, unknown>;

interface ErrorMonitoringOptionsInput {
  dsn: string | undefined;
  environment: string | undefined;
  release: string | undefined;
  runtime: string;
  service: string;
}

export function createErrorMonitoringOptions(input: ErrorMonitoringOptionsInput) {
  return {
    beforeBreadcrumb: sanitizeTelemetryBreadcrumb,
    beforeSend: sanitizeTelemetryEvent,
    dataCollection: {
      cookies: false,
      databaseQueryData: false,
      frameContextLines: 0,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
      httpBodies: [],
      httpHeaders: { request: false, response: false },
      stackFrameVariables: false,
      urlQueryParams: false,
      userInfo: false,
    },
    enableLogs: false,
    enableMetrics: false,
    enabled: input.dsn !== undefined && input.dsn.length > 0,
    initialScope: { tags: { runtime: input.runtime, service: input.service } },
    integrations: errorOnlyIntegrations,
    maxBreadcrumbs: 20,
    profileSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    sampleRate: 1,
    sendClientReports: false,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    ...(input.dsn === undefined || input.dsn.length === 0 ? {} : { dsn: input.dsn }),
    ...(input.environment === undefined ? {} : { environment: input.environment }),
    ...(input.release === undefined ? {} : { release: input.release }),
  };
}

export function sanitizeTelemetryEvent<T>(event: T): T {
  if (!isRecord(event)) return event;

  delete event.user;
  delete event.extra;

  sanitizeRequest(event);
  redactExceptionValues(event);
  sanitizeRecord(event, new WeakSet<object>(), 0);
  sanitizeBreadcrumbs(event);

  return event;
}

export function sanitizeTelemetryBreadcrumb<T>(breadcrumb: T): T | null {
  if (!isRecord(breadcrumb)) return breadcrumb;

  const category = typeof breadcrumb.category === 'string' ? breadcrumb.category : '';
  const type = typeof breadcrumb.type === 'string' ? breadcrumb.type : '';
  if (category === 'console' || category.startsWith('ui.') || type === 'user') return null;

  delete breadcrumb.message;
  sanitizeRecord(breadcrumb, new WeakSet<object>(), 0);
  return breadcrumb;
}

function sanitizeRequest(event: MutableRecord): void {
  if (!isRecord(event.request)) return;

  const request = event.request;
  for (const key of Object.keys(request)) {
    if (key !== 'method' && key !== 'url') delete request[key];
  }
}

function redactExceptionValues(event: MutableRecord): void {
  if (!isRecord(event.exception) || !Array.isArray(event.exception.values)) return;

  for (const value of event.exception.values) {
    if (isRecord(value) && 'value' in value) value.value = REDACTED;
  }
}

function sanitizeBreadcrumbs(event: MutableRecord): void {
  if (!Array.isArray(event.breadcrumbs)) return;

  const breadcrumbs: unknown[] = event.breadcrumbs;
  const sanitizedBreadcrumbs: unknown[] = [];

  for (const breadcrumb of breadcrumbs) {
    const sanitized = sanitizeTelemetryBreadcrumb(breadcrumb);
    if (sanitized !== null) sanitizedBreadcrumbs.push(sanitized);
  }

  event.breadcrumbs = sanitizedBreadcrumbs;
}

function sanitizeRecord(record: MutableRecord, seen: WeakSet<object>, depth: number): void {
  if (seen.has(record)) return;
  seen.add(record);

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = key.replaceAll(/[^A-Za-z0-9]/gu, '').toLowerCase();

    if (isSensitiveKey(normalizedKey) || normalizedKey === 'message') {
      record[key] = REDACTED;
      continue;
    }

    if (typeof value === 'string') {
      record[key] = isUrlKey(normalizedKey)
        ? stripUrlQueryAndFragment(value)
        : redactStudentIds(value);
      continue;
    }

    if (depth >= MAX_DEPTH && (Array.isArray(value) || isRecord(value))) {
      record[key] = REDACTED;
      continue;
    }

    if (Array.isArray(value)) {
      sanitizeArray(value, seen, depth + 1);
      continue;
    }

    if (isRecord(value)) sanitizeRecord(value, seen, depth + 1);
  }
}

function sanitizeArray(values: unknown[], seen: WeakSet<object>, depth: number): void {
  if (seen.has(values)) return;
  seen.add(values);

  for (const [index, value] of values.entries()) {
    if (typeof value === 'string') {
      values[index] = redactStudentIds(value);
    } else if (isRecord(value)) {
      sanitizeRecord(value, seen, depth);
    } else if (Array.isArray(value)) {
      sanitizeArray(value, seen, depth);
    }
  }
}

function redactStudentIds(value: string): string {
  return value.replace(/(^|[^0-9])[0-9]{8}(?=$|[^0-9])/gu, `$1${REDACTED_STUDENT_ID}`);
}

function stripUrlQueryAndFragment(value: string): string {
  if (value.startsWith('/')) return redactStudentIds(value.split(/[?#]/u, 1)[0] ?? value);

  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return redactStudentIds(`${url.origin}${url.pathname}`);
  } catch {
    // Non-URL breadcrumb values still receive Student ID redaction below.
  }

  return redactStudentIds(value.split(/[?#]/u, 1)[0] ?? value);
}

function errorOnlyIntegrations<T extends { name: string }>(defaultIntegrations: T[]): T[] {
  return defaultIntegrations.filter((integration) => integration.name !== 'BrowserSession');
}

function isSensitiveKey(normalizedKey: string): boolean {
  return (
    SENSITIVE_KEYS.has(normalizedKey) ||
    SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))
  );
}

function isUrlKey(normalizedKey: string): boolean {
  return URL_KEYS.has(normalizedKey) || normalizedKey.endsWith('url');
}

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
