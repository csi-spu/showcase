import type { WorkRecoveryOperation, WorkRecoveryState } from '../domain/work-recovery-policy';

export const WORK_RECOVERY_REPOSITORY = Symbol('WORK_RECOVERY_REPOSITORY');

export interface WorkRecoveryView extends WorkRecoveryState {
  publicId: string;
  publishedRevisionPublicId: string | null;
}

export interface RemovalRequestView {
  createdAt: string;
  decisionReason: string | null;
  publicId: string;
  reason: string;
  revisionPublicId: string;
  state: 'approved' | 'cancelled' | 'declined' | 'pending';
  title: string;
  version: number;
  workVersion: number;
  workPublicId: string;
}

export type RecoveryFailureOutcome =
  | 'idempotency_conflict'
  | 'not_found'
  | 'request_state_conflict'
  | 'state_conflict'
  | 'version_conflict';

export type WorkRecoveryResult =
  | { outcome: 'replayed' | 'transitioned'; work: WorkRecoveryView }
  | { outcome: RecoveryFailureOutcome };

export type RemovalRequestResult =
  | { outcome: 'created' | 'replayed' | 'resolved'; request: RemovalRequestView }
  | { outcome: RecoveryFailureOutcome };

export interface WorkRecoveryRepository {
  cancelRemovalRequest(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    requestPublicId: string;
  }): Promise<RemovalRequestResult>;
  createRemovalRequest(input: {
    actorAccountId: string;
    expectedWorkVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string;
    workPublicId: string;
  }): Promise<RemovalRequestResult>;
  decideRemovalRequest(input: {
    actorAccountId: string;
    decision: 'approve' | 'decline';
    decisionReason: string | null;
    expectedVersion: number;
    expectedWorkVersion: number;
    idempotencyKey: string;
    now: Date;
    requestPublicId: string;
  }): Promise<RemovalRequestResult>;
  findOwnedWorkState(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<WorkRecoveryView | null>;
  findOwnedPendingRemovalRequest(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<RemovalRequestView | null>;
  findWorkState(workPublicId: string): Promise<WorkRecoveryView | null>;
  listPendingRemovalRequests(limit: number): Promise<RemovalRequestView[]>;
  transition(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    operation: WorkRecoveryOperation;
    reason: string;
    workPublicId: string;
  }): Promise<WorkRecoveryResult>;
}
