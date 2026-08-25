import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { AuthError } from '../src/modules/auth/application/auth.error';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import {
  WORK_REVISIONS_REPOSITORY,
  type ReviewQueuePage,
  type WorkRevisionRepository,
  type WorkRevisionResult,
  type WorkRevisionView,
} from '../src/modules/works/application/work-revisions.ports';

const STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const ACCOUNT_ID = '74000000-0000-4000-8000-000000000001';
const WORK_PUBLIC_ID = '74000000-0000-4000-8000-000000000002';
const REVISION_PUBLIC_ID = '74000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '74000000-0000-4000-8000-000000000004';

class E2eWorkRevisionRepository implements WorkRevisionRepository {
  result: WorkRevisionResult = { outcome: 'created', revision: revision() };
  pending: WorkRevisionView | null = null;

  findPendingRevision(): Promise<WorkRevisionView | null> {
    return Promise.resolve(this.pending);
  }

  findRevisionForReview(): Promise<WorkRevisionView | null> {
    return Promise.resolve(revision());
  }

  listReviewQueue(): Promise<ReviewQueuePage> {
    return Promise.resolve({
      items: [
        {
          academicPeriod: { semester: '1', year: 2569 },
          category: 'course_work',
          number: 1,
          revisionPublicId: REVISION_PUBLIC_ID,
          submittedAt: '2026-08-25T15:00:00.000Z',
          submitterAttributionName: 'ชื่อผู้ส่ง',
          title: 'ชื่อผลงาน',
          workPublicId: WORK_PUBLIC_ID,
        },
      ],
      nextCursor: null,
    });
  }

  submitRevision(): Promise<WorkRevisionResult> {
    return Promise.resolve(this.result);
  }

  withdrawRevision(): Promise<WorkRevisionResult> {
    return Promise.resolve({
      outcome: 'withdrawn',
      revision: { ...revision(), status: 'withdrawn' },
    });
  }
}

describe('Work Revision submission and Review queue (e2e)', () => {
  let app: INestApplication<App>;
  let canMutate: boolean;
  let repository: E2eWorkRevisionRepository;

  beforeEach(async () => {
    repository = new E2eWorkRevisionRepository();
    canMutate = true;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WORK_REVISIONS_REPOSITORY)
      .useValue(repository)
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeStudentMutation: () => {
          if (!canMutate) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: ACCOUNT_ID });
        },
      })
      .overrideProvider(AdminAuthService)
      .useValue({ authorizeAdmin: () => Promise.resolve({ accountId: ACCOUNT_ID }) })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('accepts the exact Student submission contract and exposes pending state privately', async () => {
    await request(app.getHttpServer())
      .post(`/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions`)
      .set('Authorization', 'Bearer opaque-session')
      .send(submitBody())
      .expect(403);

    canMutate = false;
    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions`)
      .send(submitBody())
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    canMutate = true;

    const response = await studentRequest(
      'post',
      `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions`,
    )
      .send(submitBody())
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      outcome: 'created',
      revision: { status: 'pending_review' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/accountId|personId|studentId/i);

    repository.pending = revision();
    await studentRequest('get', `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions/pending`)
      .expect(200)
      .expect({ revision: revision() });
  });

  it('rejects unknown or invalid submission fields and returns stable completeness codes', async () => {
    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions`)
      .send({ ...submitBody(), studentId: '69000001' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions`)
      .send({ ...submitBody(), studyYear: 9 })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    repository.result = { outcome: 'media_not_ready' };
    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions`)
      .send(submitBody())
      .expect(422)
      .expect({ error: { code: 'WORK_MEDIA_NOT_READY' } });
  });

  it('withdraws a pending Revision through an optimistic idempotent contract', async () => {
    await studentRequest(
      'post',
      `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions/${REVISION_PUBLIC_ID}/withdraw`,
    )
      .send({ expectedRevisionVersion: 1, idempotencyKey: IDEMPOTENCY_KEY })
      .expect(200)
      .expect({ outcome: 'withdrawn', revision: { ...revision(), status: 'withdrawn' } });
  });

  it('authorizes the bounded Admin Review queue and immutable detail', async () => {
    await request(app.getHttpServer())
      .get('/v1/internal/admin/review-queue?limit=20')
      .set('Authorization', 'Bearer admin-session')
      .expect(403);
    const queue = await adminRequest('/v1/internal/admin/review-queue?limit=20').expect(200);
    expect(queue.body).toMatchObject({ items: [{ revisionPublicId: REVISION_PUBLIC_ID }] });
    expect(JSON.stringify(queue.body)).not.toMatch(/accountId|personId|studentId/i);
    await adminRequest(`/v1/internal/admin/revisions/${REVISION_PUBLIC_ID}`)
      .expect(200)
      .expect(revision());
    await adminRequest('/v1/internal/admin/review-queue?limit=51')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  function studentRequest(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET);
  }

  function adminRequest(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer admin-session')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET);
  }
});

function submitBody() {
  return {
    attributionName: 'ชื่อผู้ส่ง',
    expectedBasePublishedRevisionId: null,
    expectedDraftVersion: 3,
    idempotencyKey: IDEMPOTENCY_KEY,
    studyYear: 2,
  };
}

function revision(): WorkRevisionView {
  return {
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
    submittedAt: '2026-08-25T15:00:00.000Z',
    version: 1,
    withdrawnAt: null,
    workPublicId: WORK_PUBLIC_ID,
  };
}
