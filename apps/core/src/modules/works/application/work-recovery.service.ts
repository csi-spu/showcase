import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeRecoveryReason,
  type WorkRecoveryOperation,
} from '../domain/work-recovery-policy';
import { WORKS_CLOCK, type WorksClock } from './works.ports';
import {
  WORK_RECOVERY_REPOSITORY,
  type RecoveryFailureOutcome,
  type RemovalRequestResult,
  type WorkRecoveryRepository,
  type WorkRecoveryResult,
} from './work-recovery.ports';

type WorkRecoveryErrorCode =
  | 'REMOVAL_REQUEST_NOT_FOUND'
  | 'REMOVAL_REQUEST_STATE_CONFLICT'
  | 'WORK_IDEMPOTENCY_CONFLICT'
  | 'WORK_NOT_FOUND'
  | 'WORK_RECOVERY_REASON_INVALID'
  | 'WORK_RECOVERY_STATE_CONFLICT'
  | 'WORK_RECOVERY_VERSION_CONFLICT';

export class WorkRecoveryError extends Error {
  constructor(
    readonly code: WorkRecoveryErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'WorkRecoveryError';
  }
}

@Injectable()
export class WorkRecoveryService {
  constructor(
    @Inject(WORK_RECOVERY_REPOSITORY) private readonly repository: WorkRecoveryRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
  ) {}

  async getOwnedState(actorAccountId: string, workPublicId: string) {
    const work = await this.repository.findOwnedWorkState(actorAccountId, workPublicId);
    if (work === null) throw new WorkRecoveryError('WORK_NOT_FOUND', 404);
    return work;
  }

  getOwnedPendingRemovalRequest(actorAccountId: string, workPublicId: string) {
    return this.repository.findOwnedPendingRemovalRequest(actorAccountId, workPublicId);
  }

  async getState(workPublicId: string) {
    const work = await this.repository.findWorkState(workPublicId);
    if (work === null) throw new WorkRecoveryError('WORK_NOT_FOUND', 404);
    return work;
  }

  listPendingRemovalRequests(limit: number) {
    return this.repository.listPendingRemovalRequests(limit);
  }

  async transition(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    operation: WorkRecoveryOperation;
    reason: string;
    workPublicId: string;
  }): Promise<WorkRecoveryResult> {
    const reason = this.requireReason(input.reason);
    return this.requireRecoverySuccess(
      this.repository.transition({ ...input, now: this.clock.now(), reason }),
    );
  }

  async createRemovalRequest(input: {
    actorAccountId: string;
    expectedWorkVersion: number;
    idempotencyKey: string;
    reason: string;
    workPublicId: string;
  }): Promise<RemovalRequestResult> {
    const reason = this.requireReason(input.reason);
    return this.requireRemovalSuccess(
      this.repository.createRemovalRequest({ ...input, now: this.clock.now(), reason }),
    );
  }

  cancelRemovalRequest(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    requestPublicId: string;
  }): Promise<RemovalRequestResult> {
    return this.requireRemovalSuccess(
      this.repository.cancelRemovalRequest({ ...input, now: this.clock.now() }),
    );
  }

  async decideRemovalRequest(input: {
    actorAccountId: string;
    decision: 'approve' | 'decline';
    decisionReason?: string;
    expectedVersion: number;
    expectedWorkVersion: number;
    idempotencyKey: string;
    requestPublicId: string;
  }): Promise<RemovalRequestResult> {
    const decisionReason =
      input.decision === 'decline' ? this.requireReason(input.decisionReason ?? '') : null;
    return this.requireRemovalSuccess(
      this.repository.decideRemovalRequest({
        ...input,
        decisionReason,
        now: this.clock.now(),
      }),
    );
  }

  private requireReason(reason: string): string {
    const normalized = normalizeRecoveryReason(reason);
    if (normalized === null) throw new WorkRecoveryError('WORK_RECOVERY_REASON_INVALID', 422);
    return normalized;
  }

  private async requireRecoverySuccess(
    pending: Promise<WorkRecoveryResult>,
  ): Promise<WorkRecoveryResult> {
    const result = await pending;
    if ('work' in result) return result;
    throw this.failure(result.outcome, false);
  }

  private async requireRemovalSuccess(
    pending: Promise<RemovalRequestResult>,
  ): Promise<RemovalRequestResult> {
    const result = await pending;
    if ('request' in result) return result;
    throw this.failure(result.outcome, true);
  }

  private failure(outcome: RecoveryFailureOutcome, isRemovalRequest: boolean): WorkRecoveryError {
    const mapping: Record<RecoveryFailureOutcome, [WorkRecoveryErrorCode, number]> = {
      idempotency_conflict: ['WORK_IDEMPOTENCY_CONFLICT', 409],
      not_found: [isRemovalRequest ? 'REMOVAL_REQUEST_NOT_FOUND' : 'WORK_NOT_FOUND', 404],
      request_state_conflict: ['REMOVAL_REQUEST_STATE_CONFLICT', 409],
      state_conflict: ['WORK_RECOVERY_STATE_CONFLICT', 409],
      version_conflict: ['WORK_RECOVERY_VERSION_CONFLICT', 409],
    };
    const [code, status] = mapping[outcome];
    return new WorkRecoveryError(code, status);
  }
}
