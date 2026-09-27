import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it } from 'vitest';
import {
  ineligibleAccountIds,
  isExpired,
  mapCollectionGroupsError,
  selectionLimitMatchingCount,
} from './collection-groups-action-policy';

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
    expect(
      mapCollectionGroupsError(new CoreClientError('COLLECTION_GROUPS_SERVICE_UNAVAILABLE', 503)),
    ).toBe('unavailable');
    expect(mapCollectionGroupsError(new Error('boom'))).toBe('unavailable');
  });
});

describe('member selection errors', () => {
  const accountId = '40000000-0000-4000-8000-000000000001';

  it('maps selection conflicts to UI messages', () => {
    expect(mapCollectionGroupsError(new CoreClientError('MEMBER_NOT_SELECTABLE', 409))).toBe(
      'memberNotSelectable',
    );
    expect(mapCollectionGroupsError(new CoreClientError('IDEMPOTENCY_KEY_CONFLICT', 409))).toBe(
      'idempotencyKeyConflict',
    );
    expect(mapCollectionGroupsError(new CoreClientError('SELECTION_LIMIT_EXCEEDED', 422))).toBe(
      'selectionLimitExceeded',
    );
    expect(mapCollectionGroupsError(new CoreClientError('MEMBER_LIST_INVALID', 422))).toBe(
      'memberListInvalid',
    );
  });

  it('reads the ineligible Account IDs and the matching count from error details', () => {
    expect(
      ineligibleAccountIds(
        new CoreClientError('MEMBER_NOT_SELECTABLE', 409, undefined, {
          details: { accountIds: [accountId] },
        }),
      ),
    ).toEqual([accountId]);
    expect(ineligibleAccountIds(new CoreClientError('ROUND_CLOSED', 409))).toEqual([]);
    expect(
      ineligibleAccountIds(
        new CoreClientError('MEMBER_NOT_SELECTABLE', 409, undefined, {
          details: { accountIds: ['x'] },
        }),
      ),
    ).toEqual([]);
    expect(
      selectionLimitMatchingCount(
        new CoreClientError('SELECTION_LIMIT_EXCEEDED', 422, undefined, {
          details: { matchingCount: 2400 },
        }),
      ),
    ).toBe(2400);
    expect(selectionLimitMatchingCount(new Error('boom'))).toBeNull();
  });
});
