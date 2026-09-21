import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it } from 'vitest';
import { isExpired, mapCoreError, sourceAddress } from './instructor-auth-action-policy';

describe('sourceAddress', () => {
  it('prefers x-real-ip, falls back to the first x-forwarded-for hop, then unknown', () => {
    expect(sourceAddress(new Headers({ 'x-real-ip': '192.0.2.5' }))).toBe('192.0.2.5');
    expect(sourceAddress(new Headers({ 'x-forwarded-for': '192.0.2.9, 10.0.0.1' }))).toBe(
      '192.0.2.9',
    );
    expect(sourceAddress(new Headers())).toBe('unknown');
    expect(sourceAddress(new Headers({ 'x-real-ip': 'x'.repeat(200) }))).toBe('unknown');
  });
});

describe('isExpired', () => {
  it('treats SESSION_EXPIRED and UNAUTHENTICATED as expired, everything else as not', () => {
    expect(isExpired(new CoreClientError('SESSION_EXPIRED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('UNAUTHENTICATED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('INVALID_CREDENTIALS', 401))).toBe(false);
    expect(isExpired(new Error('not a core error'))).toBe(false);
  });
});

describe('mapCoreError', () => {
  it('maps known Core error codes to stable UI messages', () => {
    expect(mapCoreError(new CoreClientError('INVALID_CREDENTIALS', 401))).toBe('credentials');
    expect(mapCoreError(new CoreClientError('RATE_LIMITED', 429))).toBe('rateLimited');
    expect(mapCoreError(new CoreClientError('INVALID_PASSWORD', 422))).toBe('passwordPolicy');
    expect(mapCoreError(new CoreClientError('SESSION_EXPIRED', 401))).toBe('sessionExpired');
    expect(mapCoreError(new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503))).toBe('network');
    expect(mapCoreError(new CoreClientError('FORBIDDEN', 403))).toBe('unavailable');
  });

  it('maps a non-Core error to network without leaking details', () => {
    expect(mapCoreError(new Error('secret detail'))).toBe('network');
  });
});
