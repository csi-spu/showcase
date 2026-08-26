import type { IdentityProtector, TokenGenerator } from '../../auth/application/auth.ports';
import type {
  AttributionInvitationRepository,
  AttributionSecretProtector,
} from './attribution-invitations.ports';
import {
  AttributionInvitationError,
  AttributionInvitationsService,
} from './attribution-invitations.service';

const NOW = new Date('2026-08-25T10:00:00.000Z');
const ACCOUNT_ID = '64000000-0000-4000-8000-000000000001';
const PUBLIC_ID = '64000000-0000-4000-8000-000000000002';
const INVITATION_ID = '64000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '64000000-0000-4000-8000-000000000004';

describe('AttributionInvitationsService', () => {
  let acceptAccountInvitation: jest.MockedFunction<
    AttributionInvitationRepository['acceptAccountInvitation']
  >;
  let createAccountInvitation: jest.MockedFunction<
    AttributionInvitationRepository['createAccountInvitation']
  >;
  let createExternalInvitation: jest.MockedFunction<
    AttributionInvitationRepository['createExternalInvitation']
  >;
  let exchangeExternalToken: jest.MockedFunction<
    AttributionInvitationRepository['exchangeExternalToken']
  >;
  let repository: jest.Mocked<AttributionInvitationRepository>;
  let service: AttributionInvitationsService;

  beforeEach(() => {
    acceptAccountInvitation = jest.fn();
    createAccountInvitation = jest.fn();
    createExternalInvitation = jest.fn();
    exchangeExternalToken = jest.fn();
    repository = {
      acceptAccountInvitation,
      acceptExternalInvitation: jest.fn(),
      createAccountInvitation,
      createExternalInvitation,
      exchangeExternalRecoveryCode: jest.fn(),
      exchangeExternalToken,
      findExternalSessionInvitation: jest.fn(),
      listReceivedInvitations: jest.fn(),
      listWorkInvitations: jest.fn(),
      rejectAccountInvitation: jest.fn(),
      rejectExternalInvitation: jest.fn(),
      revokeInvitation: jest.fn(),
      withdrawAccountAttribution: jest.fn(),
    };
    service = new AttributionInvitationsService(
      repository,
      { now: () => NOW },
      identityProtector(),
      secretProtector(),
      tokenGenerator(),
    );
  });

  it('keeps Account lookup generic while hashing Student ID and source address', async () => {
    repository.createAccountInvitation.mockResolvedValue({ outcome: 'not_eligible' });

    await expect(
      service.createAccountInvitation({
        actorAccountId: ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
        sourceAddress: '203.0.113.8',
        studentId: '69000001',
      }),
    ).resolves.toEqual({ outcome: 'received' });
    expect(createAccountInvitation).toHaveBeenCalledWith({
      actorAccountId: ACCOUNT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      publicId: PUBLIC_ID,
      sourceKeyHash: 'source-hash',
      studentIdHash: 'student-id-hash',
    });

    repository.createAccountInvitation.mockResolvedValue({ outcome: 'created' });
    await expect(
      service.createAccountInvitation({
        actorAccountId: ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
        sourceAddress: '203.0.113.8',
        studentId: '69000001',
      }),
    ).resolves.toEqual({ outcome: 'received' });
  });

  it('returns an external link secret once and sends only its hash to persistence', async () => {
    repository.createExternalInvitation.mockResolvedValue({
      invitation: invitation('external'),
      outcome: 'created',
    });

    await expect(
      service.createExternalInvitation({
        actorAccountId: ACCOUNT_ID,
        affiliation: '  SPU  ',
        attributionName: '  Alex Example  ',
        contributionRole: '  ที่ปรึกษา  ',
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
      }),
    ).resolves.toMatchObject({ invitationToken: 'generated-32', outcome: 'created' });
    expect(createExternalInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliation: 'SPU',
        attributionName: 'Alex Example',
        contributionRole: 'ที่ปรึกษา',
        expiresAt: new Date('2026-09-08T10:00:00.000Z'),
        invitationTokenHash: 'invitation-token-hash',
      }),
    );
  });

  it('requires explicit valid Account attribution consent before repository mutation', async () => {
    await expect(
      service.acceptAccountInvitation({
        actorAccountId: ACCOUNT_ID,
        attributionName: 'สมหญิง ใจดี',
        consent: false,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        invitationPublicId: INVITATION_ID,
        studyYear: 4,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ATTRIBUTION', status: 422 });
    expect(acceptAccountInvitation).not.toHaveBeenCalled();
  });

  it('exchanges an external token once for a short-lived opaque session', async () => {
    repository.exchangeExternalToken.mockResolvedValue({
      invitation: invitation('external'),
      outcome: 'exchanged',
    });
    await expect(service.exchangeExternalToken('link-secret')).resolves.toMatchObject({
      invitationSessionToken: 'generated-32',
      sessionExpiresAt: '2026-08-25T10:30:00.000Z',
    });
    expect(exchangeExternalToken).toHaveBeenCalledWith({
      invitationSessionHash: 'invitation-session-hash',
      invitationTokenHash: 'invitation-token-hash',
      now: NOW,
      sessionExpiresAt: new Date('2026-08-25T10:30:00.000Z'),
    });
  });

  it('exchanges a recovery code without exposing its hash', async () => {
    repository.exchangeExternalRecoveryCode.mockResolvedValue({
      invitation: invitation('external'),
      outcome: 'exchanged',
    });
    await expect(
      service.exchangeExternalRecoveryCode('recovery-secret-123'),
    ).resolves.toMatchObject({
      invitationSessionToken: 'generated-32',
      sessionExpiresAt: '2026-08-25T10:30:00.000Z',
    });
    expect(repository.exchangeExternalRecoveryCode.mock.calls).toEqual([
      [
        {
          invitationSessionHash: 'invitation-session-hash',
          now: NOW,
          recoveryCodeHash: 'recovery-code-hash',
          sessionExpiresAt: new Date('2026-08-25T10:30:00.000Z'),
        },
      ],
    ]);
  });

  it.each([
    ['active_limit_reached', 'CONTRIBUTOR_LIMIT_REACHED', 409],
    ['idempotency_conflict', 'ATTRIBUTION_IDEMPOTENCY_CONFLICT', 409],
    ['rate_limited', 'ATTRIBUTION_LOOKUP_RATE_LIMITED', 429],
  ] as const)('maps repository outcome %s', async (outcome, code, status) => {
    repository.createAccountInvitation.mockResolvedValue({ outcome });
    await expect(
      service.createAccountInvitation({
        actorAccountId: ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
        sourceAddress: '203.0.113.8',
        studentId: '69000001',
      }),
    ).rejects.toMatchObject({ code, status });
  });

  it('uses stable application errors', () => {
    expect(new AttributionInvitationError('INVITATION_NOT_FOUND', 404)).toMatchObject({
      code: 'INVITATION_NOT_FOUND',
      name: 'AttributionInvitationError',
      status: 404,
    });
  });
});

function identityProtector(): IdentityProtector {
  return {
    hashAdminLogin: () => '',
    hashSessionToken: () => '',
    hashSourceAddress: () => 'source-hash',
    hashStudentId: () => 'student-id-hash',
    toAdminSyntheticIdentity: () => '',
    toSyntheticIdentity: () => '',
  };
}

function secretProtector(): AttributionSecretProtector {
  return {
    hashInvitationSession: () => 'invitation-session-hash',
    hashInvitationToken: () => 'invitation-token-hash',
    hashRecoveryCode: () => 'recovery-code-hash',
  };
}

function tokenGenerator(): TokenGenerator {
  return { generate: (length) => `generated-${length}` };
}

function invitation(kind: 'account' | 'external') {
  return {
    affiliation: kind === 'external' ? 'SPU' : null,
    attributionName: null,
    contributionRole: kind === 'external' ? 'ที่ปรึกษา' : null,
    createdAt: NOW.toISOString(),
    expiresAt: new Date('2026-09-08T10:00:00.000Z').toISOString(),
    kind,
    proposedAttributionName: kind === 'external' ? 'Alex Example' : null,
    publicId: INVITATION_ID,
    state: 'pending' as const,
    studyYear: null,
    version: 1,
  };
}
