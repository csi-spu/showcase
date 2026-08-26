import { Inject, Injectable } from '@nestjs/common';
import { normalizeRecoveryReason } from '../domain/work-recovery-policy';
import {
  ATTRIBUTION_SECRET_PROTECTOR,
  type AttributionSecretProtector,
} from './attribution-invitations.ports';
import {
  ATTRIBUTION_REMOVAL_REPOSITORY,
  type AttributionRemovalRepository,
  type AttributionRemovalResult,
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
  constructor(
    @Inject(ATTRIBUTION_REMOVAL_REPOSITORY)
    private readonly repository: AttributionRemovalRepository,
    @Inject(ATTRIBUTION_SECRET_PROTECTOR) private readonly protector: AttributionSecretProtector,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
  ) {}

  create(input: { idempotencyKey: string; invitationSessionToken: string; reason: string }) {
    return this.require(
      this.repository.create({
        ...input,
        invitationSessionHash: this.protector.hashInvitationSession(input.invitationSessionToken),
        now: this.clock.now(),
        reason: this.reason(input.reason),
      }),
    );
  }

  findCurrent(invitationSessionToken: string) {
    return this.repository.findCurrent(
      this.protector.hashInvitationSession(invitationSessionToken),
      this.clock.now(),
    );
  }

  listPending(limit: number) {
    return this.repository.listPending(limit);
  }

  decide(input: {
    actorAccountId: string;
    decision: 'accept' | 'decline';
    decisionReason?: string;
    expectedVersion: number;
    idempotencyKey: string;
    requestPublicId: string;
  }) {
    return this.require(
      this.repository.decide({
        ...input,
        decisionReason:
          input.decision === 'decline' ? this.reason(input.decisionReason ?? '') : null,
        now: this.clock.now(),
      }),
    );
  }

  private reason(value: string) {
    const reason = normalizeRecoveryReason(value);
    if (reason === null)
      throw new AttributionRemovalError('ATTRIBUTION_REMOVAL_REASON_INVALID', 422);
    return reason;
  }

  private async require(pending: Promise<AttributionRemovalResult>) {
    const result = await pending;
    if ('request' in result) return result;
    const errors = {
      idempotency_conflict: ['ATTRIBUTION_REMOVAL_IDEMPOTENCY_CONFLICT', 409],
      not_found: ['ATTRIBUTION_REMOVAL_NOT_FOUND', 404],
      pending_revision_exists: ['PENDING_REVISION_EXISTS', 409],
      request_state_conflict: ['ATTRIBUTION_REMOVAL_STATE_CONFLICT', 409],
      version_conflict: ['ATTRIBUTION_REMOVAL_VERSION_CONFLICT', 409],
      work_state_conflict: ['WORK_RECOVERY_STATE_CONFLICT', 409],
    } as const;
    const [code, status] = errors[result.outcome];
    throw new AttributionRemovalError(code, status);
  }
}
