export const ATTRIBUTION_REMOVAL_REPOSITORY = Symbol('ATTRIBUTION_REMOVAL_REPOSITORY');

export interface AttributionRemovalRequestView {
  attributionName: string;
  correctionRevisionPublicId: string | null;
  createdAt: string;
  publicId: string;
  reason: string;
  revisionPublicId: string;
  state: 'accepted' | 'declined' | 'pending';
  version: number;
  workPublicId: string;
}

export type AttributionRemovalResult =
  | { outcome: 'created' | 'replayed' | 'resolved'; request: AttributionRemovalRequestView }
  | {
      outcome:
        | 'idempotency_conflict'
        | 'not_found'
        | 'pending_revision_exists'
        | 'request_state_conflict'
        | 'work_state_conflict'
        | 'version_conflict';
    };

export interface AttributionRemovalRepository {
  create(input: {
    idempotencyKey: string;
    invitationSessionHash: string;
    now: Date;
    reason: string;
  }): Promise<AttributionRemovalResult>;
  decide(input: {
    actorAccountId: string;
    decision: 'accept' | 'decline';
    decisionReason: string | null;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    requestPublicId: string;
  }): Promise<AttributionRemovalResult>;
  findCurrent(
    invitationSessionHash: string,
    now: Date,
  ): Promise<AttributionRemovalRequestView | null>;
  listPending(limit: number): Promise<AttributionRemovalRequestView[]>;
}
