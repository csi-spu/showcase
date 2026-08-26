import type { WorkDraftInput } from '../domain/work-draft-policy';
import type {
  AdminCorrectionContext,
  AdminCorrectionResult,
  AdminCorrectionsRepository,
} from './admin-corrections.ports';
import { AdminCorrectionError, AdminCorrectionsService } from './admin-corrections.service';

const NOW = new Date('2026-08-26T08:00:00.000Z');
const ACCOUNT_ID = '90000000-0000-4000-8000-000000000001';
const WORK_PUBLIC_ID = '90000000-0000-4000-8000-000000000002';
const REVISION_PUBLIC_ID = '90000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '90000000-0000-4000-8000-000000000004';

class FakeAdminCorrectionsRepository implements AdminCorrectionsRepository {
  context: AdminCorrectionContext | null = correctionContext();
  result: AdminCorrectionResult = {
    outcome: 'created',
    revision: { ...correctionContext().publishedRevision, number: 2, status: 'pending_review' },
  };
  lastCreate: Parameters<AdminCorrectionsRepository['createCorrection']>[0] | undefined;

  createCorrection(input: Parameters<AdminCorrectionsRepository['createCorrection']>[0]) {
    this.lastCreate = input;
    return Promise.resolve(this.result);
  }

  findCorrectionContext() {
    return Promise.resolve(this.context);
  }
}

describe('AdminCorrectionsService', () => {
  let repository: FakeAdminCorrectionsRepository;
  let service: AdminCorrectionsService;

  beforeEach(() => {
    repository = new FakeAdminCorrectionsRepository();
    service = new AdminCorrectionsService(repository, { now: () => NOW });
  });

  it('creates a normalized pending correction from the expected Published Revision', async () => {
    await expect(service.create(input())).resolves.toEqual(repository.result);
    expect(repository.lastCreate).toMatchObject({
      actorAccountId: ACCOUNT_ID,
      candidate: { summary: 'สรุปที่ผู้ดูแลแก้ไข' },
      diff: { categories: ['content'], fields: ['summary'] },
      expectedPublishedRevisionId: REVISION_PUBLIC_ID,
      expectedRevisionVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'แก้ไขข้อความสรุปที่คลาดเคลื่อน',
      workPublicId: WORK_PUBLIC_ID,
    });
  });

  it('rejects invalid or unchanged content before persistence', async () => {
    await expect(service.create({ ...input(), summary: 'สรุปเดิม' })).rejects.toMatchObject({
      code: 'WORK_ADMIN_CORRECTION_INVALID',
      status: 422,
    });
    expect(repository.lastCreate).toBeUndefined();
  });

  it.each([
    ['not_found', 'WORK_NOT_FOUND', 404],
    ['work_state_conflict', 'WORK_ADMIN_CORRECTION_STATE_CONFLICT', 409],
    ['base_revision_conflict', 'WORK_BASE_REVISION_CONFLICT', 409],
    ['revision_version_conflict', 'WORK_REVISION_VERSION_CONFLICT', 409],
    ['pending_revision_exists', 'WORK_PENDING_REVISION_EXISTS', 409],
    ['idempotency_conflict', 'WORK_IDEMPOTENCY_CONFLICT', 409],
  ] as const)('maps %s to stable error %s', async (outcome, code, status) => {
    repository.result = { outcome };
    await expect(service.create(input())).rejects.toMatchObject({ code, status });
  });

  it('returns only an active Published Revision as the correction base', async () => {
    await expect(service.getBase(WORK_PUBLIC_ID)).resolves.toEqual(
      correctionContext().publishedRevision,
    );
    repository.context = null;
    await expect(service.getBase(WORK_PUBLIC_ID)).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
      status: 404,
    });
  });

  it('uses stable application errors', () => {
    expect(new AdminCorrectionError('WORK_NOT_FOUND', 404)).toMatchObject({
      code: 'WORK_NOT_FOUND',
      name: 'AdminCorrectionError',
      status: 404,
    });
  });
});

function input(): WorkDraftInput & {
  actorAccountId: string;
  expectedPublishedRevisionId: string;
  expectedRevisionVersion: number;
  idempotencyKey: string;
  reason: string;
  workPublicId: string;
} {
  return {
    academicPeriod: { semester: '1', year: 2569 },
    actorAccountId: ACCOUNT_ID,
    category: 'course_work',
    description: 'รายละเอียดเดิม',
    expectedPublishedRevisionId: REVISION_PUBLIC_ID,
    expectedRevisionVersion: 2,
    idempotencyKey: IDEMPOTENCY_KEY,
    links: [],
    reason: 'แก้ไขข้อความสรุปที่คลาดเคลื่อน',
    summary: 'สรุปที่ผู้ดูแลแก้ไข',
    tags: [],
    title: 'ชื่อเดิม',
    videoLinks: [],
    workPublicId: WORK_PUBLIC_ID,
  };
}

function correctionContext(): AdminCorrectionContext {
  return {
    academicRange: { currentAcademicYear: 2569, entryYear: 2566 },
    publishedRevision: {
      authorKind: 'student_submission',
      attributions: [],
      content: {
        academicPeriod: { semester: '1', year: 2569 },
        category: 'course_work',
        description: 'รายละเอียดเดิม',
        links: [],
        summary: 'สรุปเดิม',
        tags: [],
        title: 'ชื่อเดิม',
        videoLinks: [],
      },
      media: [],
      number: 1,
      publicId: REVISION_PUBLIC_ID,
      status: 'approved',
      submittedAt: NOW.toISOString(),
      version: 2,
      withdrawnAt: null,
      workPublicId: WORK_PUBLIC_ID,
    },
  };
}
