import type { PasswordPolicyErrorCode } from '../domain/password-policy';

export type AuthErrorCode =
  | 'AUTH_PROVIDER_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PASSWORD'
  | 'PASSWORD_MISSING_CHARACTER_CLASS'
  | 'RATE_LIMITED'
  | 'SESSION_EXPIRED'
  | 'UNAUTHENTICATED';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

/** Only the client-checkable composition rule gets its own code; the rest stay generic. */
export function passwordPolicyError(errorCode: PasswordPolicyErrorCode): AuthError {
  return new AuthError(
    errorCode === 'PASSWORD_MISSING_CHARACTER_CLASS' ? errorCode : 'INVALID_PASSWORD',
    422,
  );
}
