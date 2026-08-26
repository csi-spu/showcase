import type { AttributionRemovalRepository } from './attribution-removal.ports';
import { AttributionRemovalService } from './attribution-removal.service';

const NOW = new Date('2026-08-26T05:00:00.000Z');

describe('AttributionRemovalService', () => {
  const request = {
    attributionName: 'Alex Example',
    correctionRevisionPublicId: null,
    createdAt: NOW.toISOString(),
    publicId: '10000000-0000-4000-8000-000000000001',
    reason: 'ขอถอนชื่อออกจากผลงานนี้',
    revisionPublicId: '10000000-0000-4000-8000-000000000002',
    state: 'pending' as const,
    version: 1,
    workPublicId: '10000000-0000-4000-8000-000000000003',
  };
  let repository: jest.Mocked<AttributionRemovalRepository>;
  let service: AttributionRemovalService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      decide: jest.fn(),
      findCurrent: jest.fn(),
      listPending: jest.fn(),
    };
    service = new AttributionRemovalService(
      repository,
      {
        hashInvitationSession: () => 'session-hash',
        hashInvitationToken: jest.fn(),
        hashRecoveryCode: jest.fn(),
      },
      { now: () => NOW },
    );
  });

  it('creates a normalized request through a hashed recovery session', async () => {
    repository.create.mockResolvedValue({ outcome: 'created', request });
    await expect(
      service.create({
        idempotencyKey: request.publicId,
        invitationSessionToken: 'secret',
        reason: '  ขอถอนชื่อออกจากผลงานนี้  ',
      }),
    ).resolves.toMatchObject({ outcome: 'created' });
    expect(repository.create.mock.calls[0]?.[0]).toMatchObject({
      invitationSessionHash: 'session-hash',
      reason: 'ขอถอนชื่อออกจากผลงานนี้',
    });
  });

  it('requires an actionable decline reason before repository mutation', () => {
    try {
      void service.decide({
        actorAccountId: request.publicId,
        decision: 'decline',
        decisionReason: 'สั้น',
        expectedVersion: 1,
        idempotencyKey: request.publicId,
        requestPublicId: request.publicId,
      });
      throw new Error('EXPECTED_ATTRIBUTION_REMOVAL_ERROR');
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: 'ATTRIBUTION_REMOVAL_REASON_INVALID', status: 422 });
    }
    expect(repository.decide.mock.calls).toHaveLength(0);
  });
});
