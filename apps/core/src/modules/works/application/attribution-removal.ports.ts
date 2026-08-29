export const ATTRIBUTION_REMOVAL_REPOSITORY = Symbol('ATTRIBUTION_REMOVAL_REPOSITORY');

export interface AttributionRemovalRequestView {
  attributionName: string;
  attributionPublicId: string;
  correctionRevisionPublicId: string | null;
  createdAt: string;
  currentPublishedRevisionPublicId: string | null;
  currentPublishedRevisionVersion: number | null;
  publicId: string;
  reason: string;
  revisionPublicId: string;
  state: 'accepted' | 'declined' | 'pending';
  version: number;
  workPublicId: string;
  workTitle: string;
}

export interface AttributionRemovalQueuePage {
  items: AttributionRemovalRequestView[];
  nextCursor: string | null;
}

export type AttributionRemovalFailure =
  | 'idempotency_conflict'
  | 'not_found'
  | 'pending_revision_exists'
  | 'pointer_conflict'
  | 'rate_limited'
  | 'request_state_conflict'
  | 'version_conflict'
  | 'work_state_conflict';

export type AttributionRemovalDecisionResult =
  | { outcome: 'replayed' | 'resolved'; request: AttributionRemovalRequestView }
  | { outcome: AttributionRemovalFailure };

export interface AttributionRemovalRepository {
  approveAndPublish(input: {
    actorAccountId: string;
    expectedPublishedRevisionPublicId: string;
    expectedPublishedRevisionVersion: number;
    expectedRequestVersion: number;
    idempotencyKey: string;
    now: Date;
    requestPublicId: string;
  }): Promise<AttributionRemovalDecisionResult>;
  createPublic(input: {
    attributionPublicId: string;
    idempotencyKey: string;
    now: Date;
    reason: string;
    sourceKeyHash: string;
    targetKeyHash: string;
    workPublicId: string;
  }): Promise<{ outcome: 'created' | 'replayed' | AttributionRemovalFailure }>;
  decline(input: {
    actorAccountId: string;
    decisionReason: string;
    expectedRequestVersion: number;
    idempotencyKey: string;
    now: Date;
    requestPublicId: string;
  }): Promise<AttributionRemovalDecisionResult>;
  listPending(input: {
    cursor: string | undefined;
    limit: number;
  }): Promise<AttributionRemovalQueuePage | { outcome: 'invalid_cursor' }>;
}
