import type { ChangeRequestView, ReviewRepository, ReviewResult } from './reviews.ports';
import type { WorkMediaStorage } from './work-media.ports';
import { ReviewError, ReviewsService } from './reviews.service';

const NOW = new Date('2026-08-25T16:00:00.000Z');
const ADMIN_ACCOUNT_ID = '75000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '75000000-0000-4000-8000-000000000002';
const WORK_PUBLIC_ID = '75000000-0000-4000-8000-000000000003';
const REVISION_PUBLIC_ID = '75000000-0000-4000-8000-000000000004';
const REVIEW_PUBLIC_ID = '75000000-0000-4000-8000-000000000005';
const IDEMPOTENCY_KEY = '75000000-0000-4000-8000-000000000006';

class FakeReviewRepository implements ReviewRepository {
  mediaObject: { assetId: string; masterObjectKey: string } | null = {
    assetId: '75000000-0000-4000-8000-000000000007',
    masterObjectKey: 'work-media/asset/master.webp',
  };
  result: ReviewResult = { outcome: 'changed_requested', review: changeRequest() };
  studentView: ChangeRequestView | null = changeRequest();
  lastDecision: Parameters<ReviewRepository['requestChanges']>[0] | undefined;

  findLatestChangeRequestForSubmitter(): Promise<ChangeRequestView | null> {
    return Promise.resolve(this.studentView);
  }

  findRevisionMediaObject(): Promise<{ assetId: string; masterObjectKey: string } | null> {
    return Promise.resolve(this.mediaObject);
  }

  requestChanges(input: Parameters<ReviewRepository['requestChanges']>[0]) {
    this.lastDecision = input;
    return Promise.resolve(this.result);
  }
}

describe('ReviewsService', () => {
  let repository: FakeReviewRepository;
  let service: ReviewsService;

  beforeEach(() => {
    repository = new FakeReviewRepository();
    service = new ReviewsService(repository, { now: () => NOW }, storage());
  });

  it('normalizes an optimistic idempotent Change Request before persistence', async () => {
    await expect(
      service.requestChanges({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        feedback: '  กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน  ',
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'content',
        revisionPublicId: REVISION_PUBLIC_ID,
      }),
    ).resolves.toEqual(repository.result);
    expect(repository.lastDecision).toEqual({
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedRevisionVersion: 1,
      feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'content',
      revisionPublicId: REVISION_PUBLIC_ID,
    });
  });

  it('rejects invalid feedback before persistence', async () => {
    await expect(
      service.requestChanges({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        feedback: 'short',
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'content',
        revisionPublicId: REVISION_PUBLIC_ID,
      }),
    ).rejects.toMatchObject({ code: 'WORK_CHANGE_REQUEST_INVALID', status: 422 });
    expect(repository.lastDecision).toBeUndefined();
  });

  it.each([
    ['idempotency_conflict', 'WORK_IDEMPOTENCY_CONFLICT'],
    ['revision_not_found', 'WORK_REVISION_NOT_FOUND'],
    ['revision_state_conflict', 'WORK_REVISION_STATE_CONFLICT'],
    ['revision_version_conflict', 'WORK_REVISION_VERSION_CONFLICT'],
  ] as const)('maps %s to stable conflict semantics', async (outcome, code) => {
    repository.result = { outcome };
    await expect(service.requestChanges(decisionInput())).rejects.toMatchObject({ code });
  });

  it('returns an equivalent Change Request retry as a replay', async () => {
    repository.result = { outcome: 'replayed', review: changeRequest() };

    await expect(service.requestChanges(decisionInput())).resolves.toEqual(repository.result);
    expect(repository.lastDecision?.idempotencyKey).toBe(IDEMPOTENCY_KEY);
  });

  it('returns Change Request feedback only through the Submitter repository seam', async () => {
    await expect(
      service.getLatestChangeRequest(STUDENT_ACCOUNT_ID, WORK_PUBLIC_ID),
    ).resolves.toEqual(changeRequest());
    repository.studentView = null;
    await expect(
      service.getLatestChangeRequest(STUDENT_ACCOUNT_ID, WORK_PUBLIC_ID),
    ).rejects.toMatchObject({ code: 'WORK_CHANGE_REQUEST_NOT_FOUND', status: 404 });
  });

  it('authorizes a short-lived immutable Revision media preview through persistence', async () => {
    await expect(
      service.getRevisionMediaPreview(REVISION_PUBLIC_ID, '75000000-0000-4000-8000-000000000007'),
    ).resolves.toEqual({
      assetId: '75000000-0000-4000-8000-000000000007',
      expiresAt: '2026-08-25T16:10:00.000Z',
      url: 'https://r2.example.test/signed-preview',
    });
    repository.mediaObject = null;
    await expect(
      service.getRevisionMediaPreview(REVISION_PUBLIC_ID, '75000000-0000-4000-8000-000000000007'),
    ).rejects.toMatchObject({ code: 'WORK_REVISION_NOT_FOUND', status: 404 });
  });

  it('uses stable application errors', () => {
    expect(new ReviewError('WORK_CHANGE_REQUEST_INVALID', 422)).toMatchObject({
      code: 'WORK_CHANGE_REQUEST_INVALID',
      name: 'ReviewError',
      status: 422,
    });
  });
});

function storage(): WorkMediaStorage {
  return {
    createPresignedGet: () => Promise.resolve('https://r2.example.test/signed-preview'),
    createPublicUrl: () => {
      throw new Error('UNUSED');
    },
    createPresignedPut: () => Promise.reject(new Error('UNUSED')),
    deleteObject: () => Promise.reject(new Error('UNUSED')),
    getObject: () => Promise.reject(new Error('UNUSED')),
    putObject: () => Promise.reject(new Error('UNUSED')),
  };
}

function decisionInput() {
  return {
    actorAccountId: ADMIN_ACCOUNT_ID,
    expectedRevisionVersion: 1,
    feedback: 'กรุณาเพิ่มรายละเอียดที่แก้ไขได้',
    idempotencyKey: IDEMPOTENCY_KEY,
    reason: 'content',
    revisionPublicId: REVISION_PUBLIC_ID,
  };
}

function changeRequest(): ChangeRequestView {
  return {
    decision: 'changes_requested',
    feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
    publicId: REVIEW_PUBLIC_ID,
    reason: 'content',
    revisionNumber: 1,
    revisionPublicId: REVISION_PUBLIC_ID,
    reviewedAt: NOW.toISOString(),
    workPublicId: WORK_PUBLIC_ID,
  };
}
