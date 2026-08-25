export type AuthErrorCode =
  | 'AUTH_PROVIDER_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PASSWORD'
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
