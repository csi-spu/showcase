import type {
  RosterErrorRow,
  RosterRowErrorCode,
  RosterRowErrorDetail,
} from '../domain/roster-error-csv';
import type { RosterConflictResolution } from '../domain/roster-conflict-resolution';

export const ROSTER_REPOSITORY = Symbol('ROSTER_REPOSITORY');
export const STUDENT_IDENTITY_PROVIDER = Symbol('STUDENT_IDENTITY_PROVIDER');

export type RosterBatchStatus = 'completed' | 'completed_with_errors' | 'pending' | 'processing';

export interface RosterBatch {
  batchId: string;
  createdCount: number;
  entryYears: number[];
  failedCount: number;
  processedRowCount: number;
  status: RosterBatchStatus;
  totalRowCount: number;
  unchangedCount: number;
  uploadedAt: Date;
}

export interface PreparedRosterRow {
  entryYear: number;
  firstNameTh: string;
  lastNameTh: string;
  providerUserId: string;
  rowNumber: number;
  studentId: string;
  studentIdHash: string;
  syntheticIdentity: string;
}

export interface CreateRosterBatchInput {
  now: Date;
  rows: CreateRosterRowInput[];
  uploaderAccountId: string;
}

export interface InvalidRosterRowInput {
  errorCode: RosterRowErrorCode;
  rowNumber: number;
  studentId: string;
}

export type CreateRosterRowInput = InvalidRosterRowInput | PreparedRosterRow;

export function isInvalidRosterRow(row: CreateRosterRowInput): row is InvalidRosterRowInput {
  return 'errorCode' in row;
}

export function isPreparedRosterRow(row: CreateRosterRowInput): row is PreparedRosterRow {
  return !isInvalidRosterRow(row);
}

export interface ClaimedRosterRow extends PreparedRosterRow {
  attemptCount: number;
  batchId: string;
  rowId: string;
}

export interface ExistingRosterStudent {
  firstNameTh: string;
  lastNameTh: string;
  personId: string;
}

export interface RosterConflict {
  batchId: string;
  conflictId: string;
  existingFirstNameTh: string;
  existingLastNameTh: string;
  incomingFirstNameTh: string;
  incomingLastNameTh: string;
  reason: string | null;
  resolution: RosterConflictResolution | null;
  resolvedAt: Date | null;
  rowNumber: number;
  status: 'pending' | 'resolved';
  version: number;
}

export interface RosterConflictPage {
  conflicts: RosterConflict[];
  nextAfterRowNumber: number | null;
}

export interface RosterRowErrorPage {
  errors: RosterRowErrorDetail[];
  nextAfterRowNumber: number | null;
}

export type ResolveRosterConflictResult =
  | { conflict: RosterConflict; outcome: 'replayed' | 'resolved' }
  | { outcome: 'idempotency_conflict' | 'not_found' | 'version_conflict' };

export interface RosterRepository {
  claimRows(input: { leaseUntil: Date; limit: number; now: Date }): Promise<ClaimedRosterRow[]>;
  completeProvisioning(input: {
    batchId: string;
    entryYear: number;
    firstNameTh: string;
    lastNameTh: string;
    now: Date;
    providerUserId: string;
    rowId: string;
    studentIdHash: string;
    syntheticIdentity: string;
  }): Promise<'conflict' | 'created' | 'unchanged'>;
  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch>;
  deleteExpiredRowContent(input: { limit: number; now: Date }): Promise<number>;
  findExistingStudent(studentIdHash: string): Promise<ExistingRosterStudent | null>;
  getBatch(batchId: string): Promise<RosterBatch | null>;
  getErrorRows(batchId: string): Promise<RosterErrorRow[]>;
  listConflicts(input: {
    afterRowNumber: number | null;
    batchId: string;
    limit: number;
  }): Promise<RosterConflictPage>;
  listErrorRows(input: {
    afterRowNumber: number | null;
    batchId: string;
    limit: number;
  }): Promise<RosterRowErrorPage>;
  markUnchanged(input: { batchId: string; now: Date; rowId: string }): Promise<void>;
  recordFailure(input: {
    attemptCount: number;
    batchId: string;
    errorCode: RosterRowErrorCode;
    nextAttemptAt: Date;
    now: Date;
    rowId: string;
  }): Promise<void>;
  resolveConflict(input: {
    actorAccountId: string;
    conflictId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string | null;
    resolution: RosterConflictResolution;
  }): Promise<ResolveRosterConflictResult>;
  settleExistingRow(input: {
    batchId: string;
    now: Date;
    rowId: string;
    studentIdHash: string;
  }): Promise<'conflict' | 'missing' | 'unchanged'>;
}

export interface StudentIdentityProvider {
  ensureIdentity(input: {
    password: string;
    providerUserId: string;
    syntheticIdentity: string;
  }): Promise<void>;
}

export type { RosterRowErrorCode };
