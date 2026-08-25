import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import { AuthError } from '../src/modules/auth/application/auth.error';
import {
  WORKS_CLOCK,
  WORKS_REPOSITORY,
  type WorkDraftView,
  type WorkMutationResult,
  type WorksRepository,
} from '../src/modules/works/application/works.ports';

const STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const ACCOUNT_ID = '63000000-0000-4000-8000-000000000001';
const PERSON_ID = '63000000-0000-4000-8000-000000000002';
const PUBLIC_ID = '63000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '63000000-0000-4000-8000-000000000004';

class E2eWorksRepository implements WorksRepository {
  work: WorkDraftView | null = workDraft();
  mutationResult: WorkMutationResult = { outcome: 'updated', work: workDraft() };

  createWork(): Promise<WorkMutationResult> {
    return Promise.resolve({ outcome: 'created', work: workDraft() });
  }

  findAuthoringContext() {
    return Promise.resolve({ currentAcademicYear: 2569, entryYear: 2566, personId: PERSON_ID });
  }

  findOwnedDraft(): Promise<WorkDraftView | null> {
    return Promise.resolve(this.work);
  }

  updateDraft(): Promise<WorkMutationResult> {
    return Promise.resolve(this.mutationResult);
  }
}

describe('private Work Draft authoring (e2e)', () => {
  let app: INestApplication<App>;
  let canAuthor: boolean;
  let repository: E2eWorksRepository;

  beforeEach(async () => {
    repository = new E2eWorksRepository();
    canAuthor = true;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WORKS_REPOSITORY)
      .useValue(repository)
      .overrideProvider(WORKS_CLOCK)
      .useValue({ now: () => new Date('2026-08-25T10:00:00.000Z') })
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeStudentMutation: () => {
          if (!canAuthor) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: ACCOUNT_ID });
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires Student BFF authentication and an eligible Student session', async () => {
    await request(app.getHttpServer())
      .post('/v1/internal/student/works')
      .set('Authorization', 'Bearer opaque-session')
      .send(createBody())
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });

    canAuthor = false;
    await studentRequest('post', '/v1/internal/student/works')
      .send(createBody())
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    await studentRequest('get', `/v1/internal/student/works/${PUBLIC_ID}`)
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    await studentRequest('put', `/v1/internal/student/works/${PUBLIC_ID}`)
      .send({ ...createBody(), expectedVersion: 1 })
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    canAuthor = true;

    const response = await studentRequest('post', '/v1/internal/student/works')
      .send(createBody())
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      outcome: 'created',
      work: { publicId: PUBLIC_ID, version: 1 },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/studentId|accountId|personId/i);
  });

  it('reads only the Submitter-owned private Draft and exposes no Visitor route', async () => {
    await studentRequest('get', '/v1/internal/student/works/authoring-context')
      .expect(200)
      .expect({ currentAcademicYear: 2569, entryYear: 2566 });

    await studentRequest('get', `/v1/internal/student/works/${PUBLIC_ID}`)
      .expect(200)
      .expect(workDraft());

    repository.work = null;
    await studentRequest('get', `/v1/internal/student/works/${PUBLIC_ID}`)
      .expect(404)
      .expect({ error: { code: 'WORK_NOT_FOUND' } });

    await request(app.getHttpServer()).get(`/v1/public/works/${PUBLIC_ID}`).expect(404);
  });

  it('rejects unknown fields, malformed nested values, and category-specific payloads', async () => {
    await studentRequest('post', '/v1/internal/student/works')
      .send({ ...createBody(), studentId: '69000001' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });

    await studentRequest('post', '/v1/internal/student/works')
      .send({ ...createBody(), courseCode: 'CSI101' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });

    await studentRequest('post', '/v1/internal/student/works')
      .send({ ...createBody(), links: [{ label: 'เว็บไซต์', url: 'http://example.com' }] })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('applies text limits after trimming at the Core boundary', async () => {
    await studentRequest('post', '/v1/internal/student/works')
      .send({
        ...createBody(),
        description: `  ${'ก'.repeat(10_000)}  `,
        summary: `  ${'ก'.repeat(300)}  `,
        tags: ['  React  '],
        title: `  ${'ก'.repeat(150)}  `,
      })
      .expect(201);
  });

  it('returns an optimistic conflict without accepting the stale update', async () => {
    repository.mutationResult = { outcome: 'version_conflict' };
    await studentRequest('put', `/v1/internal/student/works/${PUBLIC_ID}`)
      .send({ ...createBody(), expectedVersion: 1 })
      .expect(409)
      .expect({ error: { code: 'WORK_VERSION_CONFLICT' } });
  });

  function studentRequest(method: 'get' | 'post' | 'put', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET);
  }
});

function createBody() {
  return {
    academicPeriod: { semester: '1', year: 2569 },
    category: 'course_work',
    description: 'รายละเอียดผลงาน',
    idempotencyKey: IDEMPOTENCY_KEY,
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
    summary: 'สรุปผลงาน',
    tags: ['React', 'Web App'],
    title: 'ระบบแนะนำผลงาน',
  };
}

function workDraft(): WorkDraftView {
  return {
    activityState: 'active',
    basePublishedRevisionId: null,
    draft: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดผลงาน',
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      summary: 'สรุปผลงาน',
      tags: [
        { displayLabel: 'React', normalizedIdentity: 'react' },
        { displayLabel: 'Web App', normalizedIdentity: 'web app' },
      ],
      title: 'ระบบแนะนำผลงาน',
    },
    publicationState: 'never_published',
    publicId: PUBLIC_ID,
    version: 1,
  };
}
