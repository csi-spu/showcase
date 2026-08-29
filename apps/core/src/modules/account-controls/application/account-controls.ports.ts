export const ACCOUNT_CONTROLS_REPOSITORY = Symbol('ACCOUNT_CONTROLS_REPOSITORY');
export const ACCOUNT_PASSWORD_PROVIDER = Symbol('ACCOUNT_PASSWORD_PROVIDER');

export interface AcademicYearSettings {
  currentAcademicYear: number | null;
  updatedAt: Date;
  version: number;
}

export interface StudentAccountControls {
  accessEndsAcademicYear: number;
  accountId: string;
  currentAcademicYear: number | null;
  entryYear: number;
  firstNameTh: string;
  lastNameTh: string;
  version: number;
}

export type UpdateAcademicYearResult =
  | { outcome: 'backward' | 'idempotency_conflict' | 'version_conflict' }
  | { outcome: 'replayed' | 'updated'; settings: AcademicYearSettings };

export type ExtendStudentAccessResult =
  | {
      outcome: 'idempotency_conflict' | 'not_found' | 'shortening' | 'version_conflict';
    }
  | { outcome: 'replayed' | 'unchanged' | 'updated'; student: StudentAccountControls };

export type CorrectStudentNameResult =
  | { outcome: 'idempotency_conflict' | 'not_found' | 'version_conflict' }
  | { outcome: 'replayed' | 'unchanged' | 'updated'; student: StudentAccountControls };

export type BeginPasswordResetResult =
  | {
      outcome:
        | 'already_completed'
        | 'idempotency_conflict'
        | 'in_progress'
        | 'not_found'
        | 'version_conflict';
    }
  | { attemptNumber: number; outcome: 'ready'; providerUserId: string };

export type CompletePasswordResetResult =
  { outcome: 'completed'; student: StudentAccountControls } | { outcome: 'not_pending' };

export interface AccountControlsRepository {
  correctStudentName(input: {
    actorAccountId: string;
    expectedVersion: number;
    firstNameTh: string;
    idempotencyKey: string;
    lastNameTh: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<CorrectStudentNameResult>;
  beginPasswordReset(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    studentAccountId: string;
  }): Promise<BeginPasswordResetResult>;
  completePasswordReset(input: {
    attemptNumber: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<CompletePasswordResetResult>;
  extendStudentAccess(input: {
    accessEndsAcademicYear: number;
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<ExtendStudentAccessResult>;
  findStudent(studentIdHash: string): Promise<StudentAccountControls | null>;
  failPasswordReset(input: {
    attemptNumber: number;
    errorCode: 'provider_unavailable';
    idempotencyKey: string;
    now: Date;
  }): Promise<void>;
  getAcademicYear(): Promise<AcademicYearSettings>;
  updateAcademicYear(input: {
    actorAccountId: string;
    currentAcademicYear: number;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<UpdateAcademicYearResult>;
}

export interface AccountPasswordProvider {
  resetPassword(providerUserId: string, temporaryPassword: string): Promise<void>;
}
