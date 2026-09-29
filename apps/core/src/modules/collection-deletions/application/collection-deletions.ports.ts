import type {
  CollectionDeletionTargetKind,
  CollectionRestoreAvailability,
  DeletionLogPosition,
} from '../domain/collection-deletion';

export const COLLECTION_DELETIONS_REPOSITORY = Symbol('COLLECTION_DELETIONS_REPOSITORY');

export class CollectionDeletionsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(code);
    this.name = 'CollectionDeletionsError';
  }
}

export interface CollectionDeletionTarget {
  id: string;
  kind: CollectionDeletionTargetKind;
}

/** What a deletion removes: the target and its live descendants. */
export interface CollectionDeletionCounts {
  /** Students with a current obligation on a removed form. */
  assignedStudentCount: number;
  formCount: number;
  groupCount: number;
  /** Of those Students, the ones who submitted at least one removed form. */
  submittedStudentCount: number;
}

export interface CollectionItemReference {
  id: string;
  name: string;
}

export interface CollectionDeletionPreview {
  blockedReason: 'round_closed' | null;
  counts: CollectionDeletionCounts;
  /** The target's group, for a form; null otherwise. */
  group: CollectionItemReference | null;
  kind: CollectionDeletionTargetKind;
  /** The round, group name, or form title the Instructor must type. */
  name: string;
  /** The target's round, for a group or form; null for a round. */
  round: CollectionItemReference | null;
}

export type DeleteCollectionItemResult =
  | { deletionId: string; outcome: 'deleted' }
  | { outcome: 'confirmation_mismatch' }
  | { outcome: 'not_found' }
  | { outcome: 'round_closed' };

export type RestoreCollectionDeletionResult =
  | { outcome: 'not_found' }
  | { outcome: 'restored' }
  | {
      availability: Exclude<CollectionRestoreAvailability, { status: 'available' }>;
      outcome: 'unavailable';
    };

export interface CollectionDeletionRestore {
  reason: string;
  restoredAt: Date;
  restoredByName: string;
}

/** One deletion as the log shows it. Names are the items' stored names. */
export interface CollectionDeletionLogEntry {
  counts: CollectionDeletionCounts;
  deletedAt: Date;
  deletedByName: string;
  groupName: string | null;
  id: string;
  kind: CollectionDeletionTargetKind;
  name: string;
  restore: CollectionDeletionRestore | null;
  restoreAvailability: CollectionRestoreAvailability;
  roundName: string | null;
}

export interface CollectionDeletionLogRecord extends CollectionDeletionLogEntry {
  deletedAtMicros: string;
}

export interface CollectionDeletionLogPage {
  entries: CollectionDeletionLogEntry[];
  /** Null on the last page. */
  nextCursor: string | null;
}

export interface CollectionDeletionsRepository {
  /** Null when the target does not exist or is already deleted. */
  previewDeletion(target: CollectionDeletionTarget): Promise<CollectionDeletionPreview | null>;
  deleteItem(input: {
    actorAccountId: string;
    confirmationName: string;
    now: Date;
    target: CollectionDeletionTarget;
  }): Promise<DeleteCollectionItemResult>;
  restoreDeletion(input: {
    actorAccountId: string;
    deletionId: string;
    now: Date;
    reason: string;
  }): Promise<RestoreCollectionDeletionResult>;
  listDeletions(input: {
    before: DeletionLogPosition | null;
    limit: number;
  }): Promise<{ entries: CollectionDeletionLogRecord[]; hasMore: boolean }>;
}
