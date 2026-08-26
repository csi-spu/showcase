import type {
  ReviewQueuePage,
  WorkRevisionRepository,
  WorkRevisionResult,
  WorkRevisionView,
} from './work-revisions.ports';
import { WorkRevisionError, WorkRevisionsService } from './work-revisions.service';

const NOW = new Date('2026-08-25T15:00:00.000Z');
const ACCOUNT_ID = '72000000-0000-4000-8000-000000000001';
const WORK_PUBLIC_ID = '72000000-0000-4000-8000-000000000002';
const REVISION_PUBLIC_ID = '72000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '72000000-0000-4000-8000-000000000004';

class FakeWorkRevisionRepository implements WorkRevisionRepository {
  result: WorkRevisionResult = { outcome: 'created', revision: revision() };
  page: ReviewQueuePage | { outcome: 'invalid_cursor' } = { items: [], nextCursor: null };
  detail: WorkRevisionView | null = revision();
  pending: WorkRevisionView | null = null;
  lastSubmit: Parameters<WorkRevisionRepository['submitRevision']>[0] | undefined;
  lastWithdraw: Parameters<WorkRevisionRepository['withdrawRevision']>[0] | undefined;
  lastList: Parameters<WorkRevisionRepository['listReviewQueue']>[0] | undefined;

  findRevisionForReview(): Promise<WorkRevisionView | null> {
    return Promise.resolve(this.detail);
  }

  findPendingRevision(): Promise<WorkRevisionView | null> {
    return Promise.resolve(this.pending);
  }

  listReviewQueue(input: Parameters<WorkRevisionRepository['listReviewQueue']>[0]) {
    this.lastList = input;
    return Promise.resolve(this.page);
  }

  submitRevision(input: Parameters<WorkRevisionRepository['submitRevision']>[0]) {
    this.lastSubmit = input;
    return Promise.resolve(this.result);
  }

  withdrawRevision(input: Parameters<WorkRevisionRepository['withdrawRevision']>[0]) {
    this.lastWithdraw = input;
    return Promise.resolve(this.result);
  }
}

describe('WorkRevisionsService', () => {
  let repository: FakeWorkRevisionRepository;
  let service: WorkRevisionsService;

  beforeEach(() => {
    repository = new FakeWorkRevisionRepository();
    service = new WorkRevisionsService(repository, { now: () => NOW });
  });

  it('submits normalized attribution with expected Draft/base versions and idempotency', async () => {
    await expect(
      service.submit({
        actorAccountId: ACCOUNT_ID,
        attributionName: '  ชื่อผู้ส่ง  ',
        expectedBasePublishedRevisionId: null,
        expectedDraftVersion: 4,
        idempotencyKey: IDEMPOTENCY_KEY,
        studyYear: 2,
        workPublicId: WORK_PUBLIC_ID,
      }),
    ).resolves.toEqual(repository.result);
    expect(repository.lastSubmit).toEqual({
      actorAccountId: ACCOUNT_ID,
      expectedBasePublishedRevisionId: null,
      expectedDraftVersion: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      submitterAttribution: { attributionName: 'ชื่อผู้ส่ง', studyYear: 2 },
      workPublicId: WORK_PUBLIC_ID,
    });
  });

  it.each([
    ['attribution_duplicate', 'WORK_ATTRIBUTION_DUPLICATE', 422],
    ['incomplete_content', 'WORK_SUBMISSION_INCOMPLETE', 422],
    ['missing_poster', 'WORK_POSTER_REQUIRED', 422],
    ['media_not_ready', 'WORK_MEDIA_NOT_READY', 422],
    ['attribution_unresolved', 'WORK_ATTRIBUTION_UNRESOLVED', 422],
    ['attribution_limit_exceeded', 'WORK_ATTRIBUTION_LIMIT_EXCEEDED', 422],
    ['draft_version_conflict', 'WORK_VERSION_CONFLICT', 409],
    ['base_revision_conflict', 'WORK_BASE_REVISION_CONFLICT', 409],
    ['pending_revision_exists', 'WORK_PENDING_REVISION_EXISTS', 409],
    ['idempotency_conflict', 'WORK_IDEMPOTENCY_CONFLICT', 409],
    ['not_found', 'WORK_NOT_FOUND', 404],
  ] as const)('maps submission outcome %s to stable code %s', async (outcome, code, status) => {
    repository.result = { outcome };
    await expect(service.submit(submissionInput())).rejects.toMatchObject({ code, status });
  });

  it('rejects invalid Submitter attribution before persistence', async () => {
    await expect(
      service.submit({ ...submissionInput(), attributionName: ' ', studyYear: 9 }),
    ).rejects.toMatchObject({ code: 'WORK_SUBMITTER_ATTRIBUTION_INVALID', status: 422 });
    expect(repository.lastSubmit).toBeUndefined();
  });

  it('withdraws only the expected pending Revision and preserves replay', async () => {
    repository.result = { outcome: 'withdrawn', revision: { ...revision(), status: 'withdrawn' } };
    await expect(
      service.withdraw({
        actorAccountId: ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        revisionPublicId: REVISION_PUBLIC_ID,
        workPublicId: WORK_PUBLIC_ID,
      }),
    ).resolves.toEqual(repository.result);
    expect(repository.lastWithdraw).toEqual({
      actorAccountId: ACCOUNT_ID,
      expectedRevisionVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      revisionPublicId: REVISION_PUBLIC_ID,
      workPublicId: WORK_PUBLIC_ID,
    });
  });

  it('bounds the Admin Review queue and rejects malformed cursors', async () => {
    await service.listReviewQueue(100, undefined);
    expect(repository.lastList).toEqual({ cursor: undefined, limit: 50 });
    repository.page = { outcome: 'invalid_cursor' };
    await expect(service.listReviewQueue(20, 'bad')).rejects.toMatchObject({
      code: 'WORK_REVIEW_CURSOR_INVALID',
      status: 400,
    });
  });

  it('returns an immutable Review detail or not found', async () => {
    await expect(service.getRevisionForReview(REVISION_PUBLIC_ID)).resolves.toEqual(revision());
    repository.detail = null;
    await expect(service.getRevisionForReview(REVISION_PUBLIC_ID)).rejects.toMatchObject({
      code: 'WORK_REVISION_NOT_FOUND',
      status: 404,
    });
  });

  it('uses stable application errors', () => {
    expect(new WorkRevisionError('WORK_REVISION_NOT_FOUND', 404)).toMatchObject({
      code: 'WORK_REVISION_NOT_FOUND',
      name: 'WorkRevisionError',
      status: 404,
    });
  });
});

function submissionInput() {
  return {
    actorAccountId: ACCOUNT_ID,
    attributionName: 'ชื่อผู้ส่ง',
    expectedBasePublishedRevisionId: null,
    expectedDraftVersion: 4,
    idempotencyKey: IDEMPOTENCY_KEY,
    studyYear: 2,
    workPublicId: WORK_PUBLIC_ID,
  };
}

function revision(): WorkRevisionView {
  return {
    authorKind: 'student_submission',
    attributions: [],
    content: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียด',
      links: [],
      summary: 'สรุป',
      tags: [],
      title: 'ชื่อผลงาน',
      videoLinks: [],
    },
    media: [],
    number: 1,
    publicId: REVISION_PUBLIC_ID,
    status: 'pending_review',
    submittedAt: NOW.toISOString(),
    version: 1,
    withdrawnAt: null,
    workPublicId: WORK_PUBLIC_ID,
  };
}
