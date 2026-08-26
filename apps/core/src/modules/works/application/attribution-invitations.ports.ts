import type { NormalizedAttribution } from '../domain/attribution-invitation-policy';

export const ATTRIBUTION_INVITATIONS_CLOCK = Symbol('ATTRIBUTION_INVITATIONS_CLOCK');
export const ATTRIBUTION_INVITATIONS_REPOSITORY = Symbol('ATTRIBUTION_INVITATIONS_REPOSITORY');
export const ATTRIBUTION_SECRET_PROTECTOR = Symbol('ATTRIBUTION_SECRET_PROTECTOR');

export interface AttributionInvitationsClock {
  now(): Date;
}

export interface AttributionSecretProtector {
  hashInvitationSession(value: string): string;
  hashInvitationToken(value: string): string;
  hashRecoveryCode(value: string): string;
}

export interface AttributionInvitationView {
  affiliation: string | null;
  attributionName: string | null;
  contributionRole: string | null;
  createdAt: string;
  expiresAt: string;
  kind: 'account' | 'external';
  proposedAttributionName: string | null;
  publicId: string;
  state: 'accepted' | 'expired' | 'pending' | 'rejected' | 'revoked' | 'withdrawn';
  studyYear: number | null;
  version: number;
}

export interface AttributionInvitationPage {
  items: AttributionInvitationView[];
  nextCursor: string | null;
}

export type InvitationMutationOutcome =
  'accepted' | 'rejected' | 'revoked' | 'withdrawn' | 'replayed';

export type InvitationFailureOutcome =
  | 'active_limit_reached'
  | 'idempotency_conflict'
  | 'invalid_transition'
  | 'not_found'
  | 'rate_limited'
  | 'version_conflict';

export interface AttributionInvitationRepository {
  acceptAccountInvitation(input: {
    actorAccountId: string;
    attribution: Extract<NormalizedAttribution, { kind: 'account' }>;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
    now: Date;
  }): Promise<{ outcome: 'accepted' | 'replayed' | InvitationFailureOutcome }>;
  acceptExternalInvitation(input: {
    attribution: Extract<NormalizedAttribution, { kind: 'external' }>;
    expectedVersion: number;
    idempotencyKey: string;
    invitationSessionHash: string;
    now: Date;
    recoveryCodeHash: string;
  }): Promise<{ outcome: 'accepted' | 'replayed' | InvitationFailureOutcome }>;
  createAccountInvitation(input: {
    actorAccountId: string;
    idempotencyKey: string;
    now: Date;
    publicId: string;
    sourceKeyHash: string;
    studentIdHash: string;
  }): Promise<{
    outcome:
      | 'created'
      | 'replayed'
      | 'not_eligible'
      | 'not_found'
      | 'active_limit_reached'
      | 'idempotency_conflict'
      | 'rate_limited';
  }>;
  createExternalInvitation(input: {
    actorAccountId: string;
    affiliation?: string;
    attributionName: string;
    contributionRole: string;
    expiresAt: Date;
    idempotencyKey: string;
    invitationTokenHash: string;
    now: Date;
    publicId: string;
  }): Promise<
    | { invitation: AttributionInvitationView; outcome: 'created' | 'replayed' }
    | { outcome: InvitationFailureOutcome }
  >;
  exchangeExternalToken(input: {
    actorAccountId?: string;
    invitationSessionHash: string;
    invitationTokenHash: string;
    now: Date;
    sessionExpiresAt: Date;
  }): Promise<
    | { invitation: AttributionInvitationView; outcome: 'exchanged' }
    | { outcome: 'invalid_or_expired' }
  >;
  exchangeExternalRecoveryCode(input: {
    invitationSessionHash: string;
    now: Date;
    recoveryCodeHash: string;
    sessionExpiresAt: Date;
  }): Promise<
    | { invitation: AttributionInvitationView; outcome: 'exchanged' }
    | { outcome: 'invalid_or_expired' }
  >;
  findExternalSessionInvitation(
    invitationSessionHash: string,
    now: Date,
  ): Promise<AttributionInvitationView | null>;
  listReceivedInvitations(
    accountId: string,
    limit: number,
    cursor: string | undefined,
    now: Date,
  ): Promise<AttributionInvitationPage>;
  listWorkInvitations(
    actorAccountId: string,
    publicId: string,
    limit: number,
    cursor: string | undefined,
    now: Date,
  ): Promise<AttributionInvitationPage | null>;
  rejectAccountInvitation(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
    now: Date;
  }): Promise<{ outcome: 'rejected' | 'replayed' | InvitationFailureOutcome }>;
  rejectExternalInvitation(input: {
    expectedVersion: number;
    idempotencyKey: string;
    invitationSessionHash: string;
    now: Date;
  }): Promise<{ outcome: 'rejected' | 'replayed' | InvitationFailureOutcome }>;
  revokeInvitation(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
    now: Date;
    publicId: string;
  }): Promise<{ outcome: 'revoked' | 'replayed' | InvitationFailureOutcome }>;
  withdrawAccountAttribution(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    invitationPublicId: string;
    now: Date;
  }): Promise<{ outcome: 'withdrawn' | 'replayed' | InvitationFailureOutcome }>;
}
