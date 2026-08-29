import type { IdentityProtector } from '../../auth/application/auth.ports';
import type { AttributionRemovalRepository } from './attribution-removal.ports';
import { AttributionRemovalService } from './attribution-removal.service';

const NOW = new Date('2026-08-28T05:00:00.000Z');
const ID = '10000000-0000-4000-8000-000000000001';

describe('AttributionRemovalService', () => {
  const repository: jest.Mocked<AttributionRemovalRepository> = {
    approveAndPublish: jest.fn(),
    createPublic: jest.fn(),
    decline: jest.fn(),
    listPending: jest.fn(),
  };
  const identity: IdentityProtector = {
    hashAdminLogin: jest.fn(),
    hashSessionToken: jest.fn(),
    hashSourceAddress: () => 'a'.repeat(64),
    hashStudentId: jest.fn(),
    toAdminSyntheticIdentity: jest.fn(),
    toSyntheticIdentity: jest.fn(),
  };
  const service = new AttributionRemovalService(repository, { now: () => NOW }, identity);

  beforeEach(() => jest.clearAllMocks());

  it('returns one generic receipt without storing asserted identity or contact', async () => {
    repository.createPublic.mockResolvedValue({ outcome: 'created' });
    await expect(
      service.createPublic({
        attributionPublicId: ID,
        idempotencyKey: ID,
        reason: '  ขอถอนชื่อออกจากผลงานนี้  ',
        sourceAddress: 'safe-source',
        workPublicId: ID,
      }),
    ).resolves.toEqual({ received: true });
    expect(repository.createPublic.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        attributionPublicId: ID,
        now: NOW,
        reason: 'ขอถอนชื่อออกจากผลงานนี้',
        sourceKeyHash: 'a'.repeat(64),
        workPublicId: ID,
      }),
    );
    expect(repository.createPublic.mock.calls[0]?.[0]).not.toHaveProperty('name');
    expect(repository.createPublic.mock.calls[0]?.[0]).not.toHaveProperty('email');
  });

  it('maps unknown and stale public targets to the same not-found code', async () => {
    repository.createPublic.mockResolvedValue({ outcome: 'not_found' });
    await expect(
      service.createPublic({
        attributionPublicId: ID,
        idempotencyKey: ID,
        reason: 'ขอถอนชื่อออกจากผลงานนี้',
        sourceAddress: 'safe-source',
        workPublicId: ID,
      }),
    ).rejects.toMatchObject({ code: 'PUBLIC_NOT_FOUND', status: 404 });
  });

  it('requires a bounded decline reason before repository mutation', async () => {
    await expect(
      service.decline({
        actorAccountId: ID,
        decisionReason: 'สั้น',
        expectedRequestVersion: 1,
        idempotencyKey: ID,
        requestPublicId: ID,
      }),
    ).rejects.toMatchObject({ code: 'ATTRIBUTION_REMOVAL_REASON_INVALID', status: 422 });
    expect(repository.decline.mock.calls).toHaveLength(0);
  });
});
