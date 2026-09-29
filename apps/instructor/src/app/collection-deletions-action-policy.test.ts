import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it } from 'vitest';
import {
  deletedAncestor,
  isExpired,
  mapCollectionDeletionsError,
} from './collection-deletions-action-policy';

describe('isExpired', () => {
  it('treats SESSION_EXPIRED and UNAUTHENTICATED as expired', () => {
    expect(isExpired(new CoreClientError('SESSION_EXPIRED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('UNAUTHENTICATED', 401))).toBe(true);
    expect(isExpired(new CoreClientError('ROUND_CLOSED', 409))).toBe(false);
  });
});

describe('mapCollectionDeletionsError', () => {
  it.each([
    ['COLLECTION_DELETION_ALREADY_RESTORED', 409, 'alreadyRestored'],
    ['COLLECTION_DELETION_ANCESTOR_DELETED', 409, 'ancestorDeleted'],
    ['COLLECTION_DELETION_CONFIRMATION_MISMATCH', 409, 'confirmationMismatch'],
    ['COLLECTION_DELETION_NOT_FOUND', 404, 'deletionNotFound'],
    ['COLLECTION_RESTORE_REASON_INVALID', 422, 'restoreReasonInvalid'],
    ['ROUND_NOT_FOUND', 404, 'notFound'],
    ['GROUP_NOT_FOUND', 404, 'notFound'],
    ['FORM_NOT_FOUND', 404, 'notFound'],
    ['ROUND_CLOSED', 409, 'roundClosed'],
    ['INVALID_REQUEST', 400, 'invalid'],
    ['SESSION_EXPIRED', 401, 'sessionExpired'],
    ['COLLECTION_DELETIONS_SERVICE_UNAVAILABLE', 503, 'unavailable'],
  ])('maps %s to %s', (code, status, message) => {
    expect(mapCollectionDeletionsError(new CoreClientError(code, status))).toBe(message);
  });

  it('treats anything that is not a Core error as unavailable', () => {
    expect(mapCollectionDeletionsError(new Error('network'))).toBe('unavailable');
  });
});

describe('deletedAncestor', () => {
  it('reads the ancestor Core named', () => {
    const error = new CoreClientError('COLLECTION_DELETION_ANCESTOR_DELETED', 409, undefined, {
      details: { ancestorKind: 'group', ancestorName: 'กลุ่มแม่' },
    });
    expect(deletedAncestor(error)).toEqual({ kind: 'group', name: 'กลุ่มแม่' });
  });

  it('is null for another error or malformed details', () => {
    expect(deletedAncestor(new CoreClientError('ROUND_CLOSED', 409))).toBeNull();
    expect(
      deletedAncestor(
        new CoreClientError('COLLECTION_DELETION_ANCESTOR_DELETED', 409, undefined, {
          details: { ancestorKind: 'student' },
        }),
      ),
    ).toBeNull();
  });
});
