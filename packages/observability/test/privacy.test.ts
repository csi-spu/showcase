import { describe, expect, it } from 'vitest';
import {
  createErrorMonitoringOptions,
  sanitizeTelemetryBreadcrumb,
  sanitizeTelemetryEvent,
} from '../src/privacy';

describe('createErrorMonitoringOptions', () => {
  it('uses an explicit error-only, privacy-safe baseline', () => {
    const options = createErrorMonitoringOptions({
      dsn: undefined,
      environment: 'production',
      release: 'showcase-admin@abc123',
      runtime: 'browser',
      service: 'admin',
    });

    expect(options).toMatchObject({
      dataCollection: {
        cookies: false,
        databaseQueryData: false,
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
      enabled: false,
      environment: 'production',
      initialScope: { tags: { runtime: 'browser', service: 'admin' } },
      profileSessionSampleRate: 0,
      release: 'showcase-admin@abc123',
      replaysOnErrorSampleRate: 0,
      replaysSessionSampleRate: 0,
      sampleRate: 1,
      sendClientReports: false,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    expect('dsn' in options).toBe(false);
    expect(options.integrations([{ name: 'BrowserSession' }, { name: 'GlobalHandlers' }])).toEqual([
      { name: 'GlobalHandlers' },
    ]);
  });
});

describe('sanitizeTelemetryEvent', () => {
  it('removes request and user data while retaining a path-only URL', () => {
    const event = {
      request: {
        cookies: { session: 'secret' },
        data: { studentId: '12345678' },
        headers: { authorization: 'Bearer secret' },
        url: 'https://showcase.example/students/12345678?studentId=12345678#private',
      },
      user: { email: 'student@example.test', id: 'account-id' },
    };

    sanitizeTelemetryEvent(event);

    expect(event).toEqual({
      request: { url: 'https://showcase.example/students/[redacted-student-id]' },
    });
  });

  it('redacts free-form exception text, sensitive values, and exact Student IDs', () => {
    const event = {
      contexts: {
        failure: {
          apiKey: 'provider-secret',
          clientSecret: 'private-client-secret',
          detail: 'Account 12345678 failed while 1234567 remains ordinary text',
          requestUrl: 'https://provider.example/action?token=private',
          rosterFirstName: 'Private name',
          studentIdNumber: '69000001',
          userEmail: 'private@example.test',
        },
      },
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: '/app/dist/main.js', function: 'processBatch', lineno: 42 }],
            },
            type: 'ProviderUnavailableError',
            value: 'Provider rejected student 12345678 named Private Name',
          },
        ],
      },
      message: 'Student 12345678 failed',
      tags: {
        errorCode: 'ROSTER_PROVIDER_UNAVAILABLE',
        operation: 'roster.process',
      },
    };

    sanitizeTelemetryEvent(event);

    expect(event).toEqual({
      contexts: {
        failure: {
          apiKey: '[redacted]',
          clientSecret: '[redacted]',
          detail: 'Account [redacted-student-id] failed while 1234567 remains ordinary text',
          requestUrl: 'https://provider.example/action',
          rosterFirstName: '[redacted]',
          studentIdNumber: '[redacted]',
          userEmail: '[redacted]',
        },
      },
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: '/app/dist/main.js', function: 'processBatch', lineno: 42 }],
            },
            type: 'ProviderUnavailableError',
            value: '[redacted]',
          },
        ],
      },
      message: '[redacted]',
      tags: {
        errorCode: 'ROSTER_PROVIDER_UNAVAILABLE',
        operation: 'roster.process',
      },
    });
  });
});

describe('sanitizeTelemetryBreadcrumb', () => {
  it.each(['console', 'ui.click', 'ui.input'])('drops %s breadcrumbs', (category) => {
    expect(sanitizeTelemetryBreadcrumb({ category, message: 'private input' })).toBeNull();
  });

  it('keeps safe navigation context without query data or a free-form message', () => {
    const breadcrumb = {
      category: 'navigation',
      data: {
        from: '/works?studentId=12345678',
        to: 'https://showcase.example/profile#private',
      },
      message: 'Private page title',
    };

    expect(sanitizeTelemetryBreadcrumb(breadcrumb)).toEqual({
      category: 'navigation',
      data: {
        from: '/works',
        to: 'https://showcase.example/profile',
      },
    });
  });
});
