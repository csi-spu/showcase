export const ROSTER_REPOSITORY = Symbol('ROSTER_REPOSITORY');
export const STUDENT_IDENTITY_PROVIDER = Symbol('STUDENT_IDENTITY_PROVIDER');

export type RosterBatchStatus = 'completed' | 'completed_with_errors' | 'pending' | 'processing';

export type RosterRowErrorCode =
  'ROSTER_AUTH_PROVIDER_UNAVAILABLE' | 'ROSTER_CONFLICT' | 'ROSTER_PROCESSING_FAILED';

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
  rows: PreparedRosterRow[];
  uploaderAccountId: string;
}

export interface ClaimedRosterRow extends PreparedRosterRow {
  attemptCount: number;
  batchId: string;
  rowId: string;
}

export interface ExistingRosterStudent {
  firstNameTh: string;
  lastNameTh: string;
}

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
  }): Promise<'created' | 'unchanged'>;
  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch>;
  deleteExpiredRowContent(now: Date): Promise<number>;
  findExistingStudent(studentIdHash: string): Promise<ExistingRosterStudent | null>;
  getBatch(batchId: string): Promise<RosterBatch | null>;
  markUnchanged(input: { batchId: string; now: Date; rowId: string }): Promise<void>;
  recordFailure(input: {
    attemptCount: number;
    batchId: string;
    errorCode: RosterRowErrorCode;
    nextAttemptAt: Date;
    now: Date;
    rowId: string;
  }): Promise<void>;
}

export interface StudentIdentityProvider {
  ensureIdentity(input: {
    password: string;
    providerUserId: string;
    syntheticIdentity: string;
  }): Promise<void>;
}
