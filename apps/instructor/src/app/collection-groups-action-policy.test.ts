import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it } from 'vitest';
import { isExpired, mapCollectionGroupsError } from './collection-groups-action-policy';

describe('isExpired', () => {
  it('treats SESSION_EXPIRED and UNAUTHENTICATED as expired', () => {
    expect(isExpired(new CoreClientError('SESSION_EXPIRED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('UNAUTHENTICATED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('GROUP_NOT_FOUND', 404))).toBe(false);
  });
});

describe('mapCollectionGroupsError', () => {
  it('maps every known Core error code to a stable UI message', () => {
    expect(mapCollectionGroupsError(new CoreClientError('ROUND_NAME_INVALID', 422))).toBe(
      'roundNameInvalid',
    );
    expect(mapCollectionGroupsError(new CoreClientError('GROUP_NAME_INVALID', 422))).toBe(
      'groupNameInvalid',
    );
    expect(mapCollectionGroupsError(new CoreClientError('ROUND_NOT_FOUND', 404))).toBe(
      'roundNotFound',
    );
    expect(mapCollectionGroupsError(new CoreClientError('GROUP_NOT_FOUND', 404))).toBe(
      'groupNotFound',
    );
    expect(mapCollectionGroupsError(new CoreClientError('GROUP_MEMBER_NOT_FOUND', 404))).toBe(
      'groupMemberNotFound',
    );
    expect(mapCollectionGroupsError(new CoreClientError('STUDENT_ID_LIST_INVALID', 422))).toBe(
      'studentIdListInvalid',
    );
    expect(mapCollectionGroupsError(new CoreClientError('WITHDRAWAL_REASON_INVALID', 422))).toBe(
      'withdrawalReasonInvalid',
    );
    expect(mapCollectionGroupsError(new CoreClientError('SESSION_EXPIRED', 401))).toBe(
      'sessionExpired',
    );
  });

  it('falls back to unavailable for an unmapped or non-Core error', () => {
    expect(mapCollectionGroupsError(new CoreClientError('COLLECTION_GROUPS_SERVICE_UNAVAILABLE', 503))).toBe(
      'unavailable',
    );
    expect(mapCollectionGroupsError(new Error('boom'))).toBe('unavailable');
  });
});
