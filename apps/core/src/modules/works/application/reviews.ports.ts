import type { ChangeRequestReason } from '../domain/review-decision-policy';

export const REVIEWS_REPOSITORY = Symbol('REVIEWS_REPOSITORY');

export interface ChangeRequestView {
  decision: 'changes_requested';
  feedback: string;
  publicId: string;
  reason: ChangeRequestReason;
  revisionNumber: number;
  revisionPublicId: string;
  reviewedAt: string;
  workPublicId: string;
}

export type ReviewFailureOutcome =
  | 'idempotency_conflict'
  | 'revision_not_found'
  | 'revision_state_conflict'
  | 'revision_version_conflict';

export type ReviewResult =
  | { outcome: 'changed_requested' | 'replayed'; review: ChangeRequestView }
  | { outcome: ReviewFailureOutcome };

export interface ReviewRepository {
  findLatestChangeRequestForSubmitter(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<ChangeRequestView | null>;
  findRevisionMediaObject(
    revisionPublicId: string,
    assetId: string,
  ): Promise<{ assetId: string; masterObjectKey: string } | null>;
  requestChanges(input: {
    actorAccountId: string;
    expectedRevisionVersion: number;
    feedback: string;
    idempotencyKey: string;
    now: Date;
    reason: ChangeRequestReason;
    revisionPublicId: string;
  }): Promise<ReviewResult>;
}
