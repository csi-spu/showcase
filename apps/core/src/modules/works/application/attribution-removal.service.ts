import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AUTH_IDENTITY_PROTECTOR, type IdentityProtector } from '../../auth/application/auth.ports';
import { normalizeRecoveryReason } from '../domain/work-recovery-policy';
import {
  ATTRIBUTION_REMOVAL_REPOSITORY,
  type AttributionRemovalDecisionResult,
  type AttributionRemovalFailure,
  type AttributionRemovalRepository,
} from './attribution-removal.ports';
import { WORKS_CLOCK, type WorksClock } from './works.ports';

export class AttributionRemovalError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'AttributionRemovalError';
  }
}

@Injectable()
export class AttributionRemovalService {
  private readonly logger = new Logger(AttributionRemovalService.name);

  constructor(
    @Inject(ATTRIBUTION_REMOVAL_REPOSITORY)
    private readonly repository: AttributionRemovalRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
  ) {}

  async createPublic(input: {
    attributionPublicId: string;
    idempotencyKey: string;
    reason: string;
    sourceAddress: string;
    workPublicId: string;
  }) {
    const result = await this.repository.createPublic({
      attributionPublicId: input.attributionPublicId,
      idempotencyKey: input.idempotencyKey,
      now: this.clock.now(),
      reason: this.reason(input.reason),
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
      targetKeyHash: createHash('sha256').update(input.attributionPublicId).digest('hex'),
      workPublicId: input.workPublicId,
    });
    this.logger.log({
      operation: 'public_attribution_removal_request',
      outcome: result.outcome,
      workPublicId: input.workPublicId,
    });
    if (result.outcome === 'created' || result.outcome === 'replayed') {
      return { received: true as const };
    }
    throw this.failure(result.outcome, true);
  }

  async listPending(limit: number, cursor?: string) {
    const result = await this.repository.listPending({
      cursor,
      limit: Math.min(Math.max(limit, 1), 50),
    });
    if ('outcome' in result) {
      throw new AttributionRemovalError('ATTRIBUTION_REMOVAL_CURSOR_INVALID', 422);
    }
    return result;
  }

  async decline(input: {
    actorAccountId: string;
    decisionReason: string;
    expectedRequestVersion: number;
    idempotencyKey: string;
    requestPublicId: string;
  }) {
    const result = this.requireDecision(
      await this.repository.decline({
        ...input,
        decisionReason: this.reason(input.decisionReason),
        now: this.clock.now(),
      }),
    );
    this.logDecision(input.actorAccountId, 'declined', result.request.state);
    return result;
  }

  async approveAndPublish(input: {
    actorAccountId: string;
    expectedPublishedRevisionPublicId: string;
    expectedPublishedRevisionVersion: number;
    expectedRequestVersion: number;
    idempotencyKey: string;
    requestPublicId: string;
  }) {
    const result = this.requireDecision(
      await this.repository.approveAndPublish({ ...input, now: this.clock.now() }),
    );
    this.logDecision(input.actorAccountId, 'approve_and_publish_removal', result.request.state);
    return result;
  }

  private logDecision(actorAccountId: string, decision: string, outcome: string) {
    this.logger.log({
      actorAccountId,
      decision,
      operation: 'admin_attribution_removal_decision',
      outcome,
    });
  }

  private reason(value: string) {
    const reason = normalizeRecoveryReason(value);
    if (reason === null) {
      throw new AttributionRemovalError('ATTRIBUTION_REMOVAL_REASON_INVALID', 422);
    }
    return reason;
  }

  private requireDecision(result: AttributionRemovalDecisionResult) {
    if ('request' in result) return result;
    throw this.failure(result.outcome, false);
  }

  private failure(outcome: AttributionRemovalFailure, isPublic: boolean) {
    const mapping: Record<AttributionRemovalFailure, [string, number]> = {
      idempotency_conflict: ['ATTRIBUTION_REMOVAL_IDEMPOTENCY_CONFLICT', 409],
      not_found: ['ATTRIBUTION_REMOVAL_NOT_FOUND', 404],
      pending_revision_exists: ['WORK_PENDING_REVISION_EXISTS', 409],
      pointer_conflict: ['ATTRIBUTION_REMOVAL_POINTER_CONFLICT', 409],
      rate_limited: ['ATTRIBUTION_REMOVAL_RATE_LIMITED', 429],
      request_state_conflict: ['ATTRIBUTION_REMOVAL_STATE_CONFLICT', 409],
      version_conflict: ['ATTRIBUTION_REMOVAL_VERSION_CONFLICT', 409],
      work_state_conflict: ['ATTRIBUTION_REMOVAL_WORK_CONFLICT', 409],
    };
    const [code, status] = mapping[outcome];
    return new AttributionRemovalError(
      isPublic && outcome === 'not_found' ? 'PUBLIC_NOT_FOUND' : code,
      status,
    );
  }
}
