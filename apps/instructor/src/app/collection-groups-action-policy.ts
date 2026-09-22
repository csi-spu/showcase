import { CoreClientError } from '@showcase/core-client';
import type { CollectionGroupsErrorMessage } from './collection-groups-state';

export function isExpired(error: unknown): boolean {
  return (
    error instanceof CoreClientError && ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  );
}

export function mapCollectionGroupsError(error: unknown): CollectionGroupsErrorMessage {
  if (!(error instanceof CoreClientError)) {
    return 'unavailable';
  }
  if (isExpired(error)) {
    return 'sessionExpired';
  }
  if (error.code === 'ROUND_NAME_INVALID') return 'roundNameInvalid';
  if (error.code === 'GROUP_NAME_INVALID') return 'groupNameInvalid';
  if (error.code === 'ROUND_NOT_FOUND') return 'roundNotFound';
  if (error.code === 'GROUP_NOT_FOUND') return 'groupNotFound';
  if (error.code === 'GROUP_MEMBER_NOT_FOUND') return 'groupMemberNotFound';
  if (error.code === 'GROUP_MEMBER_ALREADY_WITHDRAWN') return 'groupMemberAlreadyWithdrawn';
  if (error.code === 'GROUP_MEMBER_ALREADY_CURRENT') return 'groupMemberAlreadyCurrent';
  if (error.code === 'ROUND_CLOSED') return 'roundClosed';
  if (error.code === 'STUDENT_ACCOUNT_INACTIVE') return 'studentAccountInactive';
  if (error.code === 'STUDENT_ID_LIST_INVALID') return 'studentIdListInvalid';
  if (error.code === 'WITHDRAWAL_REASON_INVALID') return 'withdrawalReasonInvalid';
  if (error.code === 'REINSTATEMENT_REASON_INVALID') return 'reinstatementReasonInvalid';
  return 'unavailable';
}
