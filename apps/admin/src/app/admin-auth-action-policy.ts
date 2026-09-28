import { CoreClientError } from '@showcase/core-client';
import type { AuthErrorMessage } from './admin-auth-action-state';

export function sourceAddress(requestHeaders: Pick<Headers, 'get'>): string {
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  const value = requestHeaders.get('x-real-ip')?.trim() || forwarded || 'unknown';
  return value.length <= 128 ? value : 'unknown';
}

export function isExpired(error: unknown): boolean {
  return (
    error instanceof CoreClientError && ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  );
}

export function mapCoreError(error: unknown): AuthErrorMessage {
  if (!(error instanceof CoreClientError)) {
    return 'network';
  }
  if (error.code === 'INVALID_CREDENTIALS') {
    return 'credentials';
  }
  if (error.code === 'RATE_LIMITED') {
    return 'rateLimited';
  }
  if (error.code === 'INVALID_PASSWORD') {
    return 'passwordPolicy';
  }
  if (error.code === 'PASSWORD_MISSING_CHARACTER_CLASS') {
    return 'passwordComposition';
  }
  if (isExpired(error)) {
    return 'sessionExpired';
  }
  return error.code === 'AUTH_SERVICE_UNAVAILABLE' ? 'network' : 'unavailable';
}
