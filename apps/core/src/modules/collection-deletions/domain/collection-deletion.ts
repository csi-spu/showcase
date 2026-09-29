/*
 * Rules for a Collection Deletion (ADR 0023): when an item may be deleted, when
 * a deletion may be restored, and the deletion log's page cursor.
 *
 * The repository applies these rules to rows it has already locked, so the
 * answer cannot change between the check and the write.
 */

export type CollectionDeletionTargetKind = 'form' | 'group' | 'round';
export type CollectionRoundStatus = 'active' | 'closed';

export const DELETION_LOG_PAGE_SIZE = 20;

/**
 * Whether the typed confirmation names the item.
 *
 * Surrounding whitespace is ignored; everything else must match exactly, so a
 * rename by another Instructor after the modal loaded rejects the deletion.
 */
export function matchesConfirmationName(currentName: string, confirmationName: string): boolean {
  return confirmationName.trim() === currentName;
}

/**
 * Why a live item may not be deleted, or null when it may.
 *
 * A closed round may be deleted as a whole; its groups and forms may not be
 * removed from it one by one until it is reopened.
 */
export function deletionBlocker(input: {
  roundStatus: CollectionRoundStatus;
  targetKind: CollectionDeletionTargetKind;
}): 'round_closed' | null {
  return input.targetKind !== 'round' && input.roundStatus === 'closed' ? 'round_closed' : null;
}

export type CollectionRestoreAvailability =
  | { status: 'already_restored' }
  | { ancestorKind: 'group' | 'round'; ancestorName: string; status: 'ancestor_deleted' }
  | { status: 'available' }
  | { status: 'round_closed' };

/**
 * Whether a deletion may be restored now.
 *
 * A live item never has a deleted ancestor, so every ancestor must be live
 * first. The outermost deleted ancestor is named because it must be restored
 * before anything beneath it.
 */
export function restoreAvailability(input: {
  /** The target's group when a separate deletion removed it; null otherwise. */
  deletedGroupName: string | null;
  /** The target's round when a separate deletion removed it; null otherwise. */
  deletedRoundName: string | null;
  isRestored: boolean;
  roundStatus: CollectionRoundStatus;
  targetKind: CollectionDeletionTargetKind;
}): CollectionRestoreAvailability {
  if (input.isRestored) return { status: 'already_restored' };
  if (input.deletedRoundName !== null) {
    return {
      ancestorKind: 'round',
      ancestorName: input.deletedRoundName,
      status: 'ancestor_deleted',
    };
  }
  if (input.deletedGroupName !== null) {
    return {
      ancestorKind: 'group',
      ancestorName: input.deletedGroupName,
      status: 'ancestor_deleted',
    };
  }
  if (deletionBlocker(input) !== null) return { status: 'round_closed' };
  return { status: 'available' };
}

/**
 * Where a log page ended. `deletedAtMicros` keeps the database's microsecond
 * precision, which a `Date` would round away and so skip or repeat entries.
 */
export interface DeletionLogPosition {
  deletedAtMicros: string;
  deletionId: string;
}

/* Epoch microseconds for any timestamp Postgres can store fit in 17 digits. */
const CURSOR_PATTERN =
  /^(\d{1,17})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;
const MAX_CURSOR_LENGTH = 128;

/**
 * An opaque page cursor holding a deletion id and a time, never Student data.
 * It is shape-checked rather than signed: both values are ones any Instructor
 * may already read, so a forged cursor only selects another page of the log.
 */
export function encodeDeletionLogCursor(position: DeletionLogPosition): string {
  return Buffer.from(`${position.deletedAtMicros}.${position.deletionId}`).toString('base64url');
}

/** The position a cursor names, or null when it was not issued by `encodeDeletionLogCursor`. */
export function decodeDeletionLogCursor(cursor: string): DeletionLogPosition | null {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) return null;
  const match = CURSOR_PATTERN.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (match === null) return null;
  return { deletedAtMicros: match[1]!, deletionId: match[2]! };
}
