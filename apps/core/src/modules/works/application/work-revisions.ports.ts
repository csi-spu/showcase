import type { NormalizedWorkDraft } from '../domain/work-draft-policy';

export const WORK_REVISIONS_REPOSITORY = Symbol('WORK_REVISIONS_REPOSITORY');

export type WorkRevisionStatus = 'approved' | 'changes_requested' | 'pending_review' | 'withdrawn';

export interface WorkRevisionAttributionView {
  affiliation: string | null;
  attributionName: string;
  contributionRole: string | null;
  kind: 'account' | 'external' | 'submitter';
  studyYear: number | null;
}

export interface WorkRevisionMediaView {
  assetId: string;
  dominantColor: string;
  height: number;
  kind: 'gallery' | 'poster';
  position: number;
  variants: Array<{ height: number; width: number }>;
  width: number;
}

export interface WorkRevisionView {
  authorKind: 'admin_correction' | 'student_submission';
  attributions: WorkRevisionAttributionView[];
  content: NormalizedWorkDraft;
  media: WorkRevisionMediaView[];
  number: number;
  publicId: string;
  status: WorkRevisionStatus;
  submittedAt: string;
  version: number;
  withdrawnAt: string | null;
  workPublicId: string;
}

export interface ReviewQueueItem {
  academicPeriod: NormalizedWorkDraft['academicPeriod'];
  authorKind: WorkRevisionView['authorKind'];
  category: NormalizedWorkDraft['category'];
  number: number;
  revisionPublicId: string;
  submittedAt: string;
  submitterAttributionName: string;
  title: string;
  workPublicId: string;
}

export interface ReviewQueuePage {
  items: ReviewQueueItem[];
  nextCursor: string | null;
}

export type WorkRevisionFailureOutcome =
  | 'attribution_duplicate'
  | 'attribution_incomplete'
  | 'attribution_limit_exceeded'
  | 'attribution_unresolved'
  | 'base_revision_conflict'
  | 'draft_version_conflict'
  | 'idempotency_conflict'
  | 'incomplete_content'
  | 'invalid_submitter_attribution'
  | 'invalid_transition'
  | 'media_not_ready'
  | 'missing_poster'
  | 'not_found'
  | 'pending_revision_exists'
  | 'revision_version_conflict';

export type WorkRevisionResult =
  | { outcome: 'created' | 'replayed' | 'withdrawn'; revision: WorkRevisionView }
  | { outcome: WorkRevisionFailureOutcome };

export interface WorkRevisionRepository {
  findSubmissionContext(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<{ currentAcademicYear: number; entryYear: number } | null>;
  findPendingRevision(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<WorkRevisionView | null>;
  findPublishedRevision(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<WorkRevisionView | null>;
  findRevisionForReview(revisionPublicId: string): Promise<WorkRevisionView | null>;
  listReviewQueue(input: {
    cursor: string | undefined;
    limit: number;
  }): Promise<ReviewQueuePage | { outcome: 'invalid_cursor' }>;
  submitRevision(input: {
    actorAccountId: string;
    draft: NormalizedWorkDraft;
    expectedBasePublishedRevisionId: string | null;
    expectedDraftVersion: number;
    idempotencyKey: string;
    now: Date;
    studyYear: number;
    workPublicId: string;
  }): Promise<WorkRevisionResult>;
  withdrawRevision(input: {
    actorAccountId: string;
    expectedRevisionVersion: number;
    idempotencyKey: string;
    now: Date;
    revisionPublicId: string;
    workPublicId: string;
  }): Promise<WorkRevisionResult>;
}
