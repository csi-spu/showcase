import { CoreClientError } from '@showcase/core-client';
import { z } from 'zod';
import type {
  CollectionDeletionsErrorMessage,
  DeletedAncestor,
} from './collection-deletions-state';

const ancestorDetailsSchema = z.object({
  ancestorKind: z.enum(['group', 'round']),
  ancestorName: z.string().min(1),
});

const ERROR_MESSAGES: Record<string, CollectionDeletionsErrorMessage> = {
  COLLECTION_DELETION_ALREADY_RESTORED: 'alreadyRestored',
  COLLECTION_DELETION_ANCESTOR_DELETED: 'ancestorDeleted',
  COLLECTION_DELETION_CONFIRMATION_MISMATCH: 'confirmationMismatch',
  COLLECTION_DELETION_NOT_FOUND: 'deletionNotFound',
  COLLECTION_RESTORE_REASON_INVALID: 'restoreReasonInvalid',
  FORM_NOT_FOUND: 'notFound',
  GROUP_NOT_FOUND: 'notFound',
  INVALID_REQUEST: 'invalid',
  ROUND_CLOSED: 'roundClosed',
  ROUND_NOT_FOUND: 'notFound',
};

export function isExpired(error: unknown): boolean {
  return (
    error instanceof CoreClientError && ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  );
}

export function mapCollectionDeletionsError(error: unknown): CollectionDeletionsErrorMessage {
  if (!(error instanceof CoreClientError)) return 'unavailable';
  if (isExpired(error)) return 'sessionExpired';
  return ERROR_MESSAGES[error.code] ?? 'unavailable';
}

/** The ancestor Core named for COLLECTION_DELETION_ANCESTOR_DELETED; null otherwise. */
export function deletedAncestor(error: unknown): DeletedAncestor | null {
  if (
    !(error instanceof CoreClientError) ||
    error.code !== 'COLLECTION_DELETION_ANCESTOR_DELETED'
  ) {
    return null;
  }
  const details = ancestorDetailsSchema.safeParse(error.details);
  return details.success
    ? { kind: details.data.ancestorKind, name: details.data.ancestorName }
    : null;
}
