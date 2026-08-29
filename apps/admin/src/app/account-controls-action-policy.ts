import { CoreClientError } from '@showcase/core-client';
import type { AccountControlErrorMessage } from './account-controls-state';

export function mapAccountControlError(error: unknown): AccountControlErrorMessage {
  if (!(error instanceof CoreClientError)) return 'unavailable';
  if (error.code === 'ACADEMIC_YEAR_CANNOT_MOVE_BACKWARD') return 'backward';
  if (error.code === 'PASSWORD_RESET_ALREADY_COMPLETED') return 'completed';
  if (error.code === 'PASSWORD_RESET_IN_PROGRESS') return 'inProgress';
  if (error.code === 'PASSWORD_RESET_PROVIDER_UNAVAILABLE') return 'providerUnavailable';
  if (error.code === 'STUDENT_ACCESS_CANNOT_BE_SHORTENED') return 'shortening';
  if (error.code === 'STUDENT_ACCOUNT_NOT_FOUND') return 'notFound';
  if (['STUDENT_NAME_INVALID', 'STUDENT_NAME_REASON_INVALID'].includes(error.code)) {
    return 'invalid';
  }
  if (
    ['ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 'ACCOUNT_CONTROL_VERSION_CONFLICT'].includes(
      error.code,
    )
  ) {
    return 'stale';
  }
  return 'unavailable';
}

export function isAccountControlSessionExpired(error: unknown): boolean {
  return (
    error instanceof CoreClientError && ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  );
}
