import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it } from 'vitest';
import { mapAccountControlError } from './account-controls-action-policy';

describe('Account control action errors', () => {
  it.each([
    ['ACADEMIC_YEAR_CANNOT_MOVE_BACKWARD', 'backward'],
    ['PASSWORD_RESET_ALREADY_COMPLETED', 'completed'],
    ['PASSWORD_RESET_IN_PROGRESS', 'inProgress'],
    ['PASSWORD_RESET_PROVIDER_UNAVAILABLE', 'providerUnavailable'],
    ['STUDENT_ACCESS_CANNOT_BE_SHORTENED', 'shortening'],
    ['STUDENT_ACCOUNT_NOT_FOUND', 'notFound'],
    ['ADMIN_ACCOUNT_NOT_FOUND', 'notFound'],
    ['ADMIN_LOGIN_TAKEN', 'loginTaken'],
    ['ADMIN_LAST_ACTIVE_ACCOUNT', 'lastActiveAdmin'],
    ['ADMIN_SELF_STATUS_CHANGE_FORBIDDEN', 'forbidden'],
    ['INVALID_ADMIN_LOGIN', 'invalid'],
    ['INVALID_ADMIN_NAME', 'invalid'],
    ['ADMIN_STATUS_REASON_INVALID', 'invalid'],
    ['ADMIN_PROVIDER_UNAVAILABLE', 'providerUnavailable'],
    ['ACCOUNT_CONTROL_VERSION_CONFLICT', 'stale'],
    ['ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 'stale'],
  ] as const)('maps %s to %s', (code, message) => {
    expect(mapAccountControlError(new CoreClientError(code, 409))).toBe(message);
  });

  it('keeps unknown and transport failures generic', () => {
    expect(mapAccountControlError(new Error('private detail'))).toBe('unavailable');
  });
});
