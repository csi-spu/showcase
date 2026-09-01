import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { AuthError } from '../src/modules/auth/application/auth.error';
import {
  ADMIN_CORRECTIONS_REPOSITORY,
  type AdminCorrectionContext,
  type AdminCorrectionResult,
  type AdminCorrectionsRepository,
} from '../src/modules/works/application/admin-corrections.ports';
import { ReviewsService } from '../src/modules/works/application/reviews.service';
import { WORKS_CLOCK } from '../src/modules/works/application/works.ports';

const ADMIN_BFF_SECRET = 'local-development-only-shared-api-key';
const ADMIN_ACCOUNT_ID = id(1);
const WORK_PUBLIC_ID = id(2);
const BASE_REVISION_PUBLIC_ID = id(3);
const CORRECTION_REVISION_PUBLIC_ID = id(4);
const IDEMPOTENCY_KEY = id(5);
const POSTER_ID = id(6);

class FakeAdminCorrectionsRepository implements AdminCorrectionsRepository {
  context: AdminCorrectionContext | null = context();
  lastCreate: Parameters<AdminCorrectionsRepository['createCorrection']>[0] | undefined;

  createCorrection(input: Parameters<AdminCorrectionsRepository['createCorrection']>[0]) {
    this.lastCreate = input;
    const result: AdminCorrectionResult = {
      outcome: 'created',
      revision: {
        ...context().publishedRevision,
        authorKind: 'admin_correction',
        content: input.candidate,
        number: 2,
        publicId: CORRECTION_REVISION_PUBLIC_ID,
        status: 'pending_review',
        version: 1,
      },
    };
    return Promise.resolve(result);
  }

  findCorrectionContext() {
    return Promise.resolve(this.context);
  }
}

describe('Admin Work correction endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let canAdmin: boolean;
  let repository: FakeAdminCorrectionsRepository;

  beforeEach(async () => {
    canAdmin = true;
    repository = new FakeAdminCorrectionsRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ADMIN_CORRECTIONS_REPOSITORY)
      .useValue(repository)
      .overrideProvider(WORKS_CLOCK)
      .useValue({ now: () => new Date('2026-08-26T08:00:00.000Z') })
      .overrideProvider(AdminAuthService)
      .useValue({
        authorizeAdmin: () => {
          if (!canAdmin) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: ADMIN_ACCOUNT_ID });
        },
      })
      .overrideProvider(ReviewsService)
      .useValue({
        getRevisionMediaPreview: () =>
          Promise.resolve({
            expiresAt: '2026-08-26T08:10:00.000Z',
            url: 'https://r2.example.test/signed-preview',
          }),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(() => app.close());

  it('requires the Admin BFF and an authorized Admin session', async () => {
    await request(app.getHttpServer())
      .get(`/v1/internal/admin/works/${WORK_PUBLIC_ID}/correction-base`)
      .set('Authorization', 'Bearer opaque-admin-session')
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    canAdmin = false;
    await adminRequest('post', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/corrections`)
      .send(body())
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
  });

  it('loads the latest Published Revision and creates a separate pending correction', async () => {
    await adminRequest('get', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/correction-base`)
      .expect(200)
      .expect((response) => {
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toMatchObject({
          authorKind: 'student_submission',
          media: [{ preview: { url: 'https://r2.example.test/signed-preview' } }],
          publicId: BASE_REVISION_PUBLIC_ID,
          status: 'approved',
        });
      });

    await adminRequest('post', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/corrections`)
      .send(body())
      .expect(201)
      .expect((response) => {
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toMatchObject({
          outcome: 'created',
          revision: {
            authorKind: 'admin_correction',
            publicId: CORRECTION_REVISION_PUBLIC_ID,
            status: 'pending_review',
          },
        });
      });
    expect(repository.lastCreate).toMatchObject({
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedPublishedRevisionId: BASE_REVISION_PUBLIC_ID,
      reason: 'แก้ไขข้อความสรุปที่คลาดเคลื่อน',
    });
  });

  it('rejects unknown, malformed, and no-op input at the Core boundary', async () => {
    await adminRequest('post', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/corrections`)
      .send({ ...body(), studentId: '69000001' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await adminRequest('post', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/corrections`)
      .send({ ...body(), reason: 'สั้น' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await adminRequest('post', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/corrections`)
      .send({ ...body(), summary: 'สรุปเดิม' })
      .expect(422)
      .expect({ error: { code: 'WORK_ADMIN_CORRECTION_INVALID' } });
  });

  function adminRequest(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .set('Authorization', 'Bearer opaque-admin-session');
  }
});

function body() {
  return {
    academicPeriod: { semester: '1', year: 2569 },
    category: 'course_work',
    description: 'รายละเอียดเดิม',
    expectedPublishedRevisionId: BASE_REVISION_PUBLIC_ID,
    expectedRevisionVersion: 2,
    idempotencyKey: IDEMPOTENCY_KEY,
    links: [],
    reason: 'แก้ไขข้อความสรุปที่คลาดเคลื่อน',
    summary: 'สรุปที่ผู้ดูแลแก้ไข',
    tags: [],
    title: 'ชื่อเดิม',
    videoLinks: [],
  };
}

function context(): AdminCorrectionContext {
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
      media: [
        {
          assetId: POSTER_ID,
          dominantColor: '#285078',
          height: 1_800,
          kind: 'poster',
          position: 1,
          variants: [{ height: 720, width: 480 }],
          width: 1_200,
        },
      ],
      number: 1,
      publicId: BASE_REVISION_PUBLIC_ID,
      status: 'approved',
      submittedAt: '2026-08-26T07:00:00.000Z',
      version: 2,
      withdrawnAt: null,
      workPublicId: WORK_PUBLIC_ID,
    },
  };
}

function id(value: number): string {
  return `92000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
