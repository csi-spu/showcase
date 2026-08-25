import { Inject, Injectable } from '@nestjs/common';
import type { IdentityProtector, TokenGenerator } from '../../auth/application/auth.ports';
import { AUTH_IDENTITY_PROTECTOR, AUTH_TOKEN_GENERATOR } from '../../auth/application/auth.ports';
import { evaluateAttributionAcceptance } from '../domain/attribution-invitation-policy';
import {
  ATTRIBUTION_INVITATIONS_CLOCK,
  ATTRIBUTION_INVITATIONS_REPOSITORY,
  ATTRIBUTION_SECRET_PROTECTOR,
  type AttributionInvitationRepository,
  type AttributionInvitationsClock,
  type AttributionSecretProtector,
  type InvitationFailureOutcome,
} from './attribution-invitations.ports';

const EXTERNAL_INVITATION_MILLISECONDS = 14 * 24 * 60 * 60 * 1_000;
const INVITATION_SESSION_MILLISECONDS = 30 * 60 * 1_000;

type AttributionInvitationErrorCode =
  | 'ATTRIBUTION_IDEMPOTENCY_CONFLICT'
  | 'ATTRIBUTION_LOOKUP_RATE_LIMITED'
  | 'CONTRIBUTOR_LIMIT_REACHED'
  | 'INVALID_ATTRIBUTION'
  | 'INVITATION_INVALID_OR_EXPIRED'
  | 'INVITATION_INVALID_TRANSITION'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_VERSION_CONFLICT';

export class AttributionInvitationError extends Error {
  constructor(
    readonly code: AttributionInvitationErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'AttributionInvitationError';
  }
}

@Injectable()
export class AttributionInvitationsService {
  constructor(
    @Inject(ATTRIBUTION_INVITATIONS_REPOSITORY)
    private readonly repository: AttributionInvitationRepository,
    @Inject(ATTRIBUTION_INVITATIONS_CLOCK) private readonly clock: AttributionInvitationsClock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
    @Inject(ATTRIBUTION_SECRET_PROTECTOR)
    private readonly secretProtector: AttributionSecretProtector,
    @Inject(AUTH_TOKEN_GENERATOR) private readonly tokenGenerator: TokenGenerator,
  ) {}

  async createAccountInvitation(input: {
    actorAccountId: string;
    idempotencyKey: string;
    publicId: string;
    sourceAddress: string;
    studentId: string;
  }) {
    const result = await this.repository.createAccountInvitation({
      actorAccountId: input.actorAccountId,
      idempotencyKey: input.idempotencyKey,
      now: this.clock.now(),
      publicId: input.publicId,
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
      studentIdHash: this.identityProtector.hashStudentId(input.studentId),
    });
    if (
      result.outcome === 'created' ||
      result.outcome === 'not_eligible' ||
      result.outcome === 'replayed'
    ) {
      return { outcome: 'received' as const };
    }
    throw this.failure(result.outcome);
  }

  async createExternalInvitation(input: {
    actorAccountId: string;
    affiliation?: string;
    attributionName: string;
    contributionRole: string;
    idempotencyKey: string;
    publicId: string;
  }) {
    const normalized = evaluateAttributionAcceptance({
      ...(input.affiliation === undefined ? {} : { affiliation: input.affiliation }),
      attributionName: input.attributionName,
      consent: true,
      contributionRole: input.contributionRole,
      kind: 'external',
    });
    if (!normalized.isValid || normalized.attribution.kind !== 'external') {
      throw new AttributionInvitationError('INVALID_ATTRIBUTION', 422);
    }
    const invitationToken = this.tokenGenerator.generate(32);
    const now = this.clock.now();
    const result = await this.repository.createExternalInvitation({
      actorAccountId: input.actorAccountId,
      ...(normalized.attribution.affiliation === undefined
        ? {}
        : { affiliation: normalized.attribution.affiliation }),
      attributionName: normalized.attribution.attributionName,
      contributionRole: normalized.attribution.contributionRole,
      expiresAt: new Date(now.getTime() + EXTERNAL_INVITATION_MILLISECONDS),
      idempotencyKey: input.idempotencyKey,
      invitationTokenHash: this.secretProtector.hashInvitationToken(invitationToken),
      now,
      publicId: input.publicId,
    });
    if (!('invitation' in result)) throw this.failure(result.outcome);
    return result.outcome === 'created'
      ? { invitation: result.invitation, invitationToken, outcome: result.outcome }
      : { invitation: result.invitation, outcome: result.outcome };
  }

  async acceptAccountInvitation(input: {
    actorAccountId: string;
    attributionName: string;
    consent: boolean;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
    studyYear: number;
  }) {
    const normalized = evaluateAttributionAcceptance({
      attributionName: input.attributionName,
      consent: input.consent,
      kind: 'account',
      studyYear: input.studyYear,
    });
    if (!normalized.isValid || normalized.attribution.kind !== 'account') {
      throw new AttributionInvitationError('INVALID_ATTRIBUTION', 422);
    }
    return this.requireMutation(
      await this.repository.acceptAccountInvitation({
        actorAccountId: input.actorAccountId,
        attribution: normalized.attribution,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        invitationPublicId: input.invitationPublicId,
        now: this.clock.now(),
      }),
    );
  }

  async exchangeExternalToken(token: string, actorAccountId?: string) {
    const invitationSessionToken = this.tokenGenerator.generate(32);
    const now = this.clock.now();
    const sessionExpiresAt = new Date(now.getTime() + INVITATION_SESSION_MILLISECONDS);
    const result = await this.repository.exchangeExternalToken({
      ...(actorAccountId === undefined ? {} : { actorAccountId }),
      invitationSessionHash: this.secretProtector.hashInvitationSession(invitationSessionToken),
      invitationTokenHash: this.secretProtector.hashInvitationToken(token),
      now,
      sessionExpiresAt,
    });
    if (result.outcome === 'invalid_or_expired') {
      throw new AttributionInvitationError('INVITATION_INVALID_OR_EXPIRED', 404);
    }
    return {
      invitation: result.invitation,
      invitationSessionToken,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
    };
  }

  listReceivedInvitations(accountId: string, limit: number, cursor?: string) {
    return this.repository.listReceivedInvitations(accountId, limit, cursor, this.clock.now());
  }

  async getExternalInvitation(invitationSessionToken: string) {
    const invitation = await this.repository.findExternalSessionInvitation(
      this.secretProtector.hashInvitationSession(invitationSessionToken),
      this.clock.now(),
    );
    if (invitation === null) {
      throw new AttributionInvitationError('INVITATION_INVALID_OR_EXPIRED', 404);
    }
    return invitation;
  }

  async listWorkInvitations(
    actorAccountId: string,
    publicId: string,
    limit: number,
    cursor?: string,
  ) {
    const result = await this.repository.listWorkInvitations(
      actorAccountId,
      publicId,
      limit,
      cursor,
      this.clock.now(),
    );
    if (result === null) throw new AttributionInvitationError('INVITATION_NOT_FOUND', 404);
    return result;
  }

  rejectAccountInvitation(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
  }) {
    return this.mutation(
      this.repository.rejectAccountInvitation({ ...input, now: this.clock.now() }),
    );
  }

  rejectExternalInvitation(input: {
    expectedVersion: number;
    idempotencyKey: string;
    invitationSessionToken: string;
  }) {
    return this.mutation(
      this.repository.rejectExternalInvitation({
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        invitationSessionHash: this.secretProtector.hashInvitationSession(
          input.invitationSessionToken,
        ),
        now: this.clock.now(),
      }),
    );
  }

  revokeInvitation(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
    publicId: string;
  }) {
    return this.mutation(this.repository.revokeInvitation({ ...input, now: this.clock.now() }));
  }

  withdrawAccountAttribution(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
  }) {
    return this.mutation(
      this.repository.withdrawAccountAttribution({ ...input, now: this.clock.now() }),
    );
  }

  async acceptExternalInvitation(input: {
    affiliation?: string;
    attributionName: string;
    consent: boolean;
    contributionRole: string;
    expectedVersion: number;
    idempotencyKey: string;
    invitationSessionToken: string;
  }) {
    const attribution = evaluateAttributionAcceptance({
      ...(input.affiliation === undefined ? {} : { affiliation: input.affiliation }),
      attributionName: input.attributionName,
      consent: input.consent,
      contributionRole: input.contributionRole,
      kind: 'external',
    });
    if (!attribution.isValid || attribution.attribution.kind !== 'external') {
      throw new AttributionInvitationError('INVALID_ATTRIBUTION', 422);
    }
    const recoveryCode = this.tokenGenerator.generate(18);
    const result = await this.repository.acceptExternalInvitation({
      attribution: attribution.attribution,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      invitationSessionHash: this.secretProtector.hashInvitationSession(
        input.invitationSessionToken,
      ),
      now: this.clock.now(),
      recoveryCodeHash: this.secretProtector.hashRecoveryCode(recoveryCode),
    });
    const accepted = this.requireMutation(result);
    return result.outcome === 'replayed' ? accepted : { ...accepted, recoveryCode };
  }

  private async mutation(input: Promise<{ outcome: string }>) {
    return this.requireMutation(await input);
  }

  private requireMutation(result: { outcome: string }) {
    if (['accepted', 'rejected', 'replayed', 'revoked', 'withdrawn'].includes(result.outcome)) {
      return { outcome: result.outcome };
    }
    throw this.failure(result.outcome as InvitationFailureOutcome);
  }

  private failure(outcome: InvitationFailureOutcome) {
    const errors: Record<InvitationFailureOutcome, AttributionInvitationError> = {
      active_limit_reached: new AttributionInvitationError('CONTRIBUTOR_LIMIT_REACHED', 409),
      idempotency_conflict: new AttributionInvitationError('ATTRIBUTION_IDEMPOTENCY_CONFLICT', 409),
      invalid_transition: new AttributionInvitationError('INVITATION_INVALID_TRANSITION', 409),
      not_found: new AttributionInvitationError('INVITATION_NOT_FOUND', 404),
      rate_limited: new AttributionInvitationError('ATTRIBUTION_LOOKUP_RATE_LIMITED', 429),
      version_conflict: new AttributionInvitationError('INVITATION_VERSION_CONFLICT', 409),
    };
    return errors[outcome];
  }
}
