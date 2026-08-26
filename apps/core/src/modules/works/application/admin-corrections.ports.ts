import type { AdminCorrectionDiff } from '../domain/admin-correction-policy';
import type { NormalizedWorkDraft } from '../domain/work-draft-policy';
import type { WorkRevisionView } from './work-revisions.ports';

export const ADMIN_CORRECTIONS_REPOSITORY = Symbol('ADMIN_CORRECTIONS_REPOSITORY');

export interface AdminCorrectionContext {
  academicRange: { currentAcademicYear: number; entryYear: number };
  publishedRevision: WorkRevisionView;
}

export type AdminCorrectionFailureOutcome =
  | 'base_revision_conflict'
  | 'idempotency_conflict'
  | 'not_found'
  | 'pending_revision_exists'
  | 'revision_version_conflict'
  | 'work_state_conflict';

export type AdminCorrectionResult =
  | { outcome: 'created' | 'replayed'; revision: WorkRevisionView }
  | { outcome: AdminCorrectionFailureOutcome };

export interface AdminCorrectionsRepository {
  createCorrection(input: {
    actorAccountId: string;
    candidate: NormalizedWorkDraft;
    diff: AdminCorrectionDiff;
    expectedPublishedRevisionId: string;
    expectedRevisionVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string;
    workPublicId: string;
  }): Promise<AdminCorrectionResult>;
  findCorrectionContext(workPublicId: string): Promise<AdminCorrectionContext | null>;
}
