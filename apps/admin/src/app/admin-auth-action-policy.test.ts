import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it } from 'vitest';
import { isExpired, mapCoreError, sourceAddress } from './admin-auth-action-policy';

describe('Admin Server Action policy', () => {
  it.each([
    [new CoreClientError('INVALID_CREDENTIALS', 401), 'credentials'],
    [new CoreClientError('RATE_LIMITED', 429), 'rateLimited'],
    [new CoreClientError('INVALID_PASSWORD', 422), 'passwordPolicy'],
    [new CoreClientError('PASSWORD_MISSING_CHARACTER_CLASS', 422), 'passwordComposition'],
    [new CoreClientError('SESSION_EXPIRED', 401), 'sessionExpired'],
    [new CoreClientError('UNAUTHENTICATED', 401), 'sessionExpired'],
    [new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503), 'network'],
    [new CoreClientError('UNEXPECTED_CODE', 500), 'unavailable'],
    [new Error('unknown failure'), 'network'],
  ])('maps Core failure %# to safe UI state', (error, expected) => {
    expect(mapCoreError(error)).toBe(expected);
  });

  it('recognizes only session authentication failures as expired', () => {
    expect(isExpired(new CoreClientError('SESSION_EXPIRED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('UNAUTHENTICATED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('FORBIDDEN', 403))).toBe(false);
    expect(isExpired(new Error('unknown'))).toBe(false);
  });

  it('uses proxy-overwritten client address headers and bounds untrusted values', () => {
    const headers = (values: Record<string, string | null>) => ({
      get: (name: string) => values[name] ?? null,
    });
    expect(sourceAddress(headers({ 'x-real-ip': ' 192.0.2.40 ' }))).toBe('192.0.2.40');
    expect(sourceAddress(headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe(
      '198.51.100.1',
    );
    expect(sourceAddress(headers({ 'x-real-ip': 'x'.repeat(129) }))).toBe('unknown');
    expect(sourceAddress(headers({}))).toBe('unknown');
  });
});
