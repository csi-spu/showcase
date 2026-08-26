import type { WorkRecoveryRepository } from './work-recovery.ports';
import { WorkRecoveryError, WorkRecoveryService } from './work-recovery.service';

const NOW = new Date('2026-08-26T04:00:00.000Z');
const repository = {
  cancelRemovalRequest: jest.fn(),
  createRemovalRequest: jest.fn(),
  decideRemovalRequest: jest.fn(),
  findOwnedWorkState: jest.fn(),
  findOwnedPendingRemovalRequest: jest.fn(),
  findWorkState: jest.fn(),
  listPendingRemovalRequests: jest.fn(),
  transition: jest.fn(),
} satisfies jest.Mocked<WorkRecoveryRepository>;
const service = new WorkRecoveryService(repository, { now: () => NOW });

describe('WorkRecoveryService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('normalizes and delegates an audited archive transition', async () => {
    repository.transition.mockResolvedValue({ outcome: 'transitioned', work: work() });

    await expect(
      service.transition({
        actorAccountId: 'account-id',
        expectedVersion: 2,
        idempotencyKey: '65000000-0000-4000-8000-000000000001',
        operation: 'archive',
        reason: '  ไม่เหมาะสมสำหรับเผยแพร่ในขณะนี้  ',
        workPublicId: work().publicId,
      }),
    ).resolves.toMatchObject({ outcome: 'transitioned' });
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        now: NOW,
        reason: 'ไม่เหมาะสมสำหรับเผยแพร่ในขณะนี้'.normalize('NFKC'),
      }),
    );
  });

  it('rejects an invalid recovery reason before persistence', async () => {
    await expect(
      service.transition({
        actorAccountId: 'account-id',
        expectedVersion: 2,
        idempotencyKey: '65000000-0000-4000-8000-000000000001',
        operation: 'unpublish',
        reason: 'สั้น',
        workPublicId: work().publicId,
      }),
    ).rejects.toMatchObject({ code: 'WORK_RECOVERY_REASON_INVALID', status: 422 });
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('creates a reasoned Removal Request without changing visibility', async () => {
    repository.createRemovalRequest.mockResolvedValue({
      outcome: 'created',
      request: removalRequest(),
    });
    await expect(
      service.createRemovalRequest({
        actorAccountId: 'account-id',
        expectedWorkVersion: 2,
        idempotencyKey: '65000000-0000-4000-8000-000000000002',
        reason: '  ต้องการนำผลงานออกจากหน้าเผยแพร่  ',
        workPublicId: work().publicId,
      }),
    ).resolves.toMatchObject({ outcome: 'created' });
    expect(repository.createRemovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        now: NOW,
        reason: 'ต้องการนำผลงานออกจากหน้าเผยแพร่'.normalize('NFKC'),
      }),
    );
  });

  it('requires a reason when an Admin declines a Removal Request', async () => {
    await expect(
      service.decideRemovalRequest({
        actorAccountId: 'admin-id',
        decision: 'decline',
        decisionReason: 'สั้น',
        expectedVersion: 1,
        expectedWorkVersion: 2,
        idempotencyKey: '65000000-0000-4000-8000-000000000003',
        requestPublicId: removalRequest().publicId,
      }),
    ).rejects.toMatchObject({ code: 'WORK_RECOVERY_REASON_INVALID', status: 422 });
  });

  it('maps concurrency conflicts to a stable API error', async () => {
    repository.cancelRemovalRequest.mockResolvedValue({ outcome: 'version_conflict' });
    await expect(
      service.cancelRemovalRequest({
        actorAccountId: 'account-id',
        expectedVersion: 1,
        idempotencyKey: '65000000-0000-4000-8000-000000000004',
        requestPublicId: removalRequest().publicId,
      }),
    ).rejects.toEqual(new WorkRecoveryError('WORK_RECOVERY_VERSION_CONFLICT', 409));
  });
});

function work() {
  return {
    activityState: 'active' as const,
    publicationState: 'published' as const,
    publicId: '65000000-0000-4000-8000-000000000010',
    publishedRevisionId: '65000000-0000-4000-8000-000000000011',
    publishedRevisionPublicId: '65000000-0000-4000-8000-000000000012',
    version: 2,
  };
}

function removalRequest() {
  return {
    createdAt: NOW.toISOString(),
    decisionReason: null,
    publicId: '65000000-0000-4000-8000-000000000020',
    reason: 'ต้องการนำผลงานออกจากหน้าเผยแพร่',
    revisionPublicId: '65000000-0000-4000-8000-000000000012',
    state: 'pending' as const,
    title: 'ผลงานตัวอย่าง',
    version: 1,
    workVersion: 2,
    workPublicId: work().publicId,
  };
}
