import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { AuthError } from '../src/modules/auth/application/auth.error';
import {
  PUBLICATION_REPOSITORY,
  type PublicationRepository,
  type PublicationResult,
  type PublicWorkView,
} from '../src/modules/works/application/publication.ports';
import { WORK_MEDIA_STORAGE } from '../src/modules/works/application/work-media.ports';

const ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const ADMIN_ACCOUNT_ID = '84000000-0000-4000-8000-000000000001';
const WORK_PUBLIC_ID = '84000000-0000-4000-8000-000000000002';
const REVISION_PUBLIC_ID = '84000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '84000000-0000-4000-8000-000000000004';
const ASSET_ID = '84000000-0000-4000-8000-000000000005';

class E2ePublicationRepository implements PublicationRepository {
  result: PublicationResult = { outcome: 'published', publication: publication() };
  publicWork: PublicWorkView | null = publicWork();

  approveAndPublish(): Promise<PublicationResult> {
    return Promise.resolve(this.result);
  }

  findPublicMediaObjectKey(
    workPublicId: string,
    assetId: string,
    width: number,
  ): Promise<string | null> {
    return Promise.resolve(
      workPublicId === WORK_PUBLIC_ID && assetId === ASSET_ID && width === 480
        ? `media/${ASSET_ID}/480.webp`
        : null,
    );
  }

  findPublicWork(): Promise<PublicWorkView | null> {
    return Promise.resolve(this.publicWork);
  }
}

describe('first Work publication and public detail (e2e)', () => {
  let app: INestApplication<App>;
  let repository: E2ePublicationRepository;

  beforeEach(async () => {
    repository = new E2ePublicationRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PUBLICATION_REPOSITORY)
      .useValue(repository)
      .overrideProvider(WORK_MEDIA_STORAGE)
      .useValue({
        createPresignedGet: ({ key }: { key: string }) =>
          Promise.resolve(`https://r2.example.test/presigned/${key}`),
      })
      .overrideProvider(AdminAuthService)
      .useValue({
        authorizeAdmin: (token: string) => {
          if (token !== 'admin-session') throw new AuthError('UNAUTHENTICATED', 401);
          return Promise.resolve({ accountId: ADMIN_ACCOUNT_ID });
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('requires authorized Admin BFF access and the exact optimistic approval contract', async () => {
    await request(app.getHttpServer())
      .post(`/v1/internal/admin/revisions/${REVISION_PUBLIC_ID}/approve-and-publish`)
      .set('Authorization', 'Bearer admin-session')
      .send(approvalBody())
      .expect(403);
    await adminMutation()
      .send({ ...approvalBody(), studentId: '69000001' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });

    const response = await adminMutation().send(approvalBody()).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ outcome: 'published', publication: publication() });

    repository.result = { outcome: 'revision_state_conflict' };
    await adminMutation()
      .send(approvalBody())
      .expect(409)
      .expect({ error: { code: 'WORK_REVISION_STATE_CONFLICT' } });
  });

  it('rejects wrong BFF secrets and malformed publication/media identifiers', async () => {
    await request(app.getHttpServer())
      .post(`/v1/internal/admin/revisions/${REVISION_PUBLIC_ID}/approve-and-publish`)
      .set('Authorization', 'Bearer admin-session')
      .set('x-admin-bff-secret', 'wrong-secret')
      .send(approvalBody())
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    await request(app.getHttpServer())
      .post('/v1/internal/admin/revisions/not-a-uuid/approve-and-publish')
      .set('Authorization', 'Bearer admin-session')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send(approvalBody())
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await request(app.getHttpServer())
      .get('/v1/public/works/not-a-uuid')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}/media/not-a-uuid/variants/480`)
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('uses one cacheable stable public Work URL without leaking private identity', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}`)
      .expect(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
    );
    expect(response.body).toEqual(publicWork());
    expect(JSON.stringify(response.body)).not.toMatch(/studentId|accountId|personId|session/i);

    repository.publicWork = null;
    await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}`)
      .expect(404)
      .expect({ error: { code: 'PUBLIC_WORK_NOT_FOUND' } });
  });

  it('authorizes only eligible processed variants before issuing a bounded media URL', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}/media/${ASSET_ID}/variants/480`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual({
      url: `https://r2.example.test/presigned/media/${ASSET_ID}/480.webp`,
    });
    await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}/media/${ASSET_ID}/variants/999`)
      .expect(404)
      .expect({ error: { code: 'PUBLIC_WORK_NOT_FOUND' } });
  });

  function adminMutation() {
    return request(app.getHttpServer())
      .post(`/v1/internal/admin/revisions/${REVISION_PUBLIC_ID}/approve-and-publish`)
      .set('Authorization', 'Bearer admin-session')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET);
  }
});

function approvalBody() {
  return { expectedRevisionVersion: 1, idempotencyKey: IDEMPOTENCY_KEY };
}

function publication() {
  return {
    publishedAt: '2026-08-25T18:00:00.000Z',
    revisionPublicId: REVISION_PUBLIC_ID,
    revisionVersion: 2,
    workPublicId: WORK_PUBLIC_ID,
  };
}

function publicWork(): PublicWorkView {
  return {
    academicPeriod: { semester: '1', year: 2569 },
    attributions: [
      {
        affiliation: null,
        attributionPublicId: REVISION_PUBLIC_ID,
        attributionName: 'ชื่อผู้ส่ง',
        canRequestRemoval: false,
        contributionRole: null,
        profilePublicId: null,
        studyYear: 2,
      },
    ],
    category: 'course_work',
    description: 'รายละเอียดผลงาน',
    links: [],
    media: [
      {
        assetId: ASSET_ID,
        dominantColor: '#285078',
        height: 1_800,
        kind: 'poster',
        position: 1,
        variants: [{ height: 720, width: 480 }],
        width: 1_200,
      },
    ],
    publishedAt: '2026-08-25T18:00:00.000Z',
    revisionNumber: 1,
    summary: 'สรุปผลงาน',
    tags: [{ displayLabel: 'React', publicId: '84000000-0000-4000-8000-000000000006' }],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
    workPublicId: WORK_PUBLIC_ID,
  };
}
