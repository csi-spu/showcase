import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import { AuthError } from '../src/modules/auth/application/auth.error';
import { WorkMediaService } from '../src/modules/works/application/work-media.service';
import {
  PublicationError,
  PublicationService,
} from '../src/modules/works/application/publication.service';
import {
  WORKS_CLOCK,
  WORKS_REPOSITORY,
  type WorkDraftView,
  type WorkListPage,
  type WorkMutationResult,
  type WorksRepository,
} from '../src/modules/works/application/works.ports';

const STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const ACCOUNT_ID = '63000000-0000-4000-8000-000000000001';
const PERSON_ID = '63000000-0000-4000-8000-000000000002';
const PUBLIC_ID = '63000000-0000-4000-8000-000000000003';
const OTHER_PUBLIC_ID = '63000000-0000-4000-8000-000000000005';
const IDEMPOTENCY_KEY = '63000000-0000-4000-8000-000000000004';

class E2eWorksRepository implements WorksRepository {
  work: WorkDraftView | null = workDraft();
  mutationResult: WorkMutationResult = { outcome: 'updated', work: workDraft() };
  lastRebase: Parameters<WorksRepository['rebaseDraft']>[0] | undefined;
  lastSeed: Parameters<WorksRepository['seedDraft']>[0] | undefined;
  lastList: Parameters<WorksRepository['listOwnedWorks']>[0] | undefined;
  listPage: WorkListPage = {
    currentPage: 1,
    items: [
      {
        activityState: 'active',
        academicPeriod: { semester: '1', year: 2569 },
        category: 'course_work',
        displayedSource: 'draft',
        hasDraft: true,
        isDraftComplete: true,
        latestRevisionStatus: null,
        poster: null,
        primaryAction: 'continue_editing',
        publicationState: 'never_published',
        publicId: PUBLIC_ID,
        secondaryActions: ['archive_saved_draft'],
        summary: 'สรุปผลงาน',
        title: 'ระบบจัดการกิจกรรม',
        updatedAt: new Date('2026-08-25T10:00:00.000Z'),
        version: 1,
      },
    ],
    hasNextPage: false,
    hasPreviousPage: false,
    nextCursor: null,
    pageSize: 12,
    previousCursor: null,
    totalItems: 1,
    totalPages: 1,
  };

  archiveSavedDraft(): ReturnType<WorksRepository['archiveSavedDraft']> {
    return Promise.resolve({ outcome: 'state_conflict' });
  }

  createWork(): Promise<WorkMutationResult> {
    return Promise.resolve({ outcome: 'created', work: workDraft() });
  }

  findAuthoringContext() {
    return Promise.resolve({ currentAcademicYear: 2569, entryYear: 2566, personId: PERSON_ID });
  }

  findOwnedDraft(_accountId: string, publicId: string): Promise<WorkDraftView | null> {
    return Promise.resolve(publicId === PUBLIC_ID ? this.work : null);
  }

  findOwnedWorkState(_accountId: string, publicId: string) {
    return Promise.resolve(
      publicId === PUBLIC_ID
        ? {
            activityState: 'active' as const,
            draft: this.work,
            publicationState: 'published' as const,
            publishedRevisionId: PUBLIC_ID,
            publicId: PUBLIC_ID,
          }
        : null,
    );
  }

  listOwnedWorks(input: Parameters<WorksRepository['listOwnedWorks']>[0]): Promise<WorkListPage> {
    this.lastList = input;
    return Promise.resolve(this.listPage);
  }

  getWorkspaceSummary(): ReturnType<WorksRepository['getWorkspaceSummary']> {
    return Promise.resolve({
      canMutate: true,
      changeRequestCount: 0,
      draftCount: 1,
      latestActionableDraftPublicId: PUBLIC_ID,
      pendingReviewCount: 0,
      publishedCount: 0,
    });
  }

  patchDraft(): Promise<WorkMutationResult> {
    return Promise.resolve(this.mutationResult);
  }

  rebaseDraft(input: Parameters<WorksRepository['rebaseDraft']>[0]): Promise<WorkMutationResult> {
    this.lastRebase = input;
    return Promise.resolve(this.mutationResult);
  }

  restoreSavedDraft(): ReturnType<WorksRepository['restoreSavedDraft']> {
    return Promise.resolve({ outcome: 'state_conflict' });
  }

  seedDraft(input: Parameters<WorksRepository['seedDraft']>[0]): Promise<WorkMutationResult> {
    this.lastSeed = input;
    return Promise.resolve(this.mutationResult);
  }

  updateDraft(): Promise<WorkMutationResult> {
    return Promise.resolve(this.mutationResult);
  }
}

describe('private Work Draft authoring (e2e)', () => {
  let app: INestApplication<App>;
  let canAuthor: boolean;
  let repository: E2eWorksRepository;
  let media: {
    attachReadyMedia: jest.Mock;
    authorizeUpload: jest.Mock;
    finalizeUpload: jest.Mock;
    getUploadStatus: jest.Mock;
  };

  beforeEach(async () => {
    repository = new E2eWorksRepository();
    media = {
      attachReadyMedia: jest.fn().mockResolvedValue({ outcome: 'attached', version: 2 }),
      authorizeUpload: jest.fn().mockResolvedValue({
        assetId: IDEMPOTENCY_KEY,
        expiresAt: '2026-08-25T10:10:00.000Z',
        headers: { 'content-type': 'image/jpeg' },
        status: 'pending_upload',
        uploadUrl: 'https://r2.example.test/presigned',
      }),
      finalizeUpload: jest.fn().mockResolvedValue({ assetId: IDEMPOTENCY_KEY, status: 'uploaded' }),
      getUploadStatus: jest.fn().mockResolvedValue({
        assetId: IDEMPOTENCY_KEY,
        preview: null,
        rejectionCode: null,
        status: 'processing',
        warnings: [],
      }),
    };
    canAuthor = true;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WORKS_REPOSITORY)
      .useValue(repository)
      .overrideProvider(WORKS_CLOCK)
      .useValue({ now: () => new Date('2026-08-25T10:00:00.000Z') })
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeStudentRead: () => {
          if (!canAuthor) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: ACCOUNT_ID });
        },
        authorizeStudentMutation: () => {
          if (!canAuthor) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: ACCOUNT_ID });
        },
      })
      .overrideProvider(WorkMediaService)
      .useValue(media)
      .overrideProvider(PublicationService)
      .useValue({
        getPublicMedia: () => {
          throw new PublicationError('PUBLIC_WORK_NOT_FOUND', 404);
        },
        getPublicWork: () => {
          throw new PublicationError('PUBLIC_WORK_NOT_FOUND', 404);
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
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toMatchObject({
      outcome: 'created',
      work: { publicId: PUBLIC_ID, version: 1 },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/studentId|accountId|personId/i);
  });

  it('rejects wrong BFF secrets and malformed Work identifiers before repository access', async () => {
    await request(app.getHttpServer())
      .get(`/v1/internal/student/works/${PUBLIC_ID}`)
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', 'wrong-secret')
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });

    await studentRequest('get', '/v1/internal/student/works/not-a-uuid')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await studentRequest('get', `/v1/internal/student/works/${OTHER_PUBLIC_ID}`)
      .expect(404)
      .expect({ error: { code: 'WORK_NOT_FOUND' } });
    await studentRequest('post', '/v1/internal/student/works/not-a-uuid/draft')
      .send({ expectedPublishedRevisionId: PUBLIC_ID, idempotencyKey: IDEMPOTENCY_KEY })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('reads only the Submitter-owned private Draft and exposes no Visitor route', async () => {
    const listResponse = await studentRequest(
      'get',
      '/v1/internal/student/works?query=%E0%B8%81&category=course_work&status=draft&sort=updated_asc&page=3',
    ).expect(200);
    expect(listResponse.headers['cache-control']).toBe('private, no-store');
    expect(listResponse.body).toEqual({
      items: [
        expect.objectContaining({
          publicId: PUBLIC_ID,
          title: 'ระบบจัดการกิจกรรม',
          updatedAt: '2026-08-25T10:00:00.000Z',
        }),
      ],
      currentPage: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      nextCursor: null,
      pageSize: 12,
      previousCursor: null,
      totalItems: 1,
      totalPages: 1,
    });
    expect(JSON.stringify(listResponse.body)).not.toMatch(/studentId|accountId|personId|workId/i);
    expect(repository.lastList).toMatchObject({
      accountId: ACCOUNT_ID,
      category: 'course_work',
      page: 3,
      query: 'ก',
      sort: 'updated_asc',
      status: 'draft',
      view: 'current',
    });

    await studentRequest('get', '/v1/internal/student/works?status=invalid').expect(400);

    await studentRequest('get', '/v1/internal/student/works/authoring-context')
      .expect(200)
      .expect({ currentAcademicYear: 2569, entryYear: 2566 });

    await studentRequest('get', `/v1/internal/student/works/${PUBLIC_ID}`)
      .expect(200)
      .expect({ ...workDraft(), savedAt: '2026-08-25T10:00:00.000Z' });

    repository.work = null;
    await studentRequest('get', `/v1/internal/student/works/${PUBLIC_ID}`)
      .expect(404)
      .expect({ error: { code: 'WORK_NOT_FOUND' } });

    await request(app.getHttpServer()).get(`/v1/public/works/${PUBLIC_ID}`).expect(404);
  });

  it('exposes exact optimistic Published Draft seed and rebase contracts', async () => {
    await studentRequest('get', `/v1/internal/student/works/${PUBLIC_ID}/authoring-state`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          publicationState: 'published',
          publishedRevisionId: PUBLIC_ID,
          publicId: PUBLIC_ID,
        });
      });

    await studentRequest('post', `/v1/internal/student/works/${PUBLIC_ID}/draft`)
      .send({ expectedPublishedRevisionId: PUBLIC_ID, idempotencyKey: IDEMPOTENCY_KEY })
      .expect(201);
    expect(repository.lastSeed).toMatchObject({
      actorAccountId: ACCOUNT_ID,
      expectedPublishedRevisionId: PUBLIC_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      publicId: PUBLIC_ID,
    });

    await studentRequest('post', `/v1/internal/student/works/${PUBLIC_ID}/draft/rebase`)
      .send({
        expectedPublishedRevisionId: PUBLIC_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(200);
    expect(repository.lastRebase).toMatchObject({
      actorAccountId: ACCOUNT_ID,
      expectedPublishedRevisionId: PUBLIC_ID,
      expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      publicId: PUBLIC_ID,
    });

    await studentRequest('post', `/v1/internal/student/works/${PUBLIC_ID}/draft/rebase`)
      .send({
        expectedPublishedRevisionId: PUBLIC_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        overwritePublishedRevision: true,
      })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
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

  it('authorizes media only through the Student BFF and validates exact upload and attachment contracts', async () => {
    await studentRequest('post', `/v1/internal/student/works/${PUBLIC_ID}/media-uploads`)
      .send({
        byteSize: 1024,
        contentType: 'image/jpeg',
        fileExtension: 'jpg',
        idempotencyKey: IDEMPOTENCY_KEY,
        mediaKind: 'poster',
      })
      .expect(200)
      .expect({
        assetId: IDEMPOTENCY_KEY,
        expiresAt: '2026-08-25T10:10:00.000Z',
        headers: { 'content-type': 'image/jpeg' },
        status: 'pending_upload',
        uploadUrl: 'https://r2.example.test/presigned',
      });
    expect(media.authorizeUpload).toHaveBeenCalledWith({
      actorAccountId: ACCOUNT_ID,
      byteSize: 1024,
      contentType: 'image/jpeg',
      fileExtension: 'jpg',
      idempotencyKey: IDEMPOTENCY_KEY,
      mediaKind: 'poster',
      publicId: PUBLIC_ID,
    });

    await studentRequest('post', `/v1/internal/student/works/${PUBLIC_ID}/media-uploads`)
      .send({
        byteSize: 5_242_881,
        contentType: 'image/jpeg',
        fileExtension: 'jpg',
        idempotencyKey: IDEMPOTENCY_KEY,
        mediaKind: 'poster',
      })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await studentRequest(
      'post',
      `/v1/internal/student/works/${PUBLIC_ID}/media-uploads/${IDEMPOTENCY_KEY}/finalize`,
    )
      .expect(200)
      .expect({ assetId: IDEMPOTENCY_KEY, status: 'uploaded' });
    await studentRequest(
      'get',
      `/v1/internal/student/works/${PUBLIC_ID}/media-uploads/${IDEMPOTENCY_KEY}`,
    )
      .expect(200)
      .expect({
        assetId: IDEMPOTENCY_KEY,
        preview: null,
        rejectionCode: null,
        status: 'processing',
        warnings: [],
      });
    await studentRequest('put', `/v1/internal/student/works/${PUBLIC_ID}/media`)
      .send({
        assetId: IDEMPOTENCY_KEY,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        mediaKind: 'poster',
      })
      .expect(200)
      .expect({ outcome: 'attached', version: 2 });
    expect(media.attachReadyMedia).toHaveBeenCalledWith({
      actorAccountId: ACCOUNT_ID,
      assetId: IDEMPOTENCY_KEY,
      expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      mediaKind: 'poster',
      publicId: PUBLIC_ID,
    });
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
    videoLinks: [],
  };
}

function workDraft(): WorkDraftView {
  return {
    activityState: 'active',
    basePublishedRevisionId: null,
    contributors: [],
    draft: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดผลงาน',
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      summary: 'สรุปผลงาน',
      submitterStudyYear: 3,
      tags: [
        { displayLabel: 'React', normalizedIdentity: 'react' },
        { displayLabel: 'Web App', normalizedIdentity: 'web app' },
      ],
      title: 'ระบบแนะนำผลงาน',
      videoLinks: [],
    },
    isComplete: true,
    media: [],
    publicationState: 'never_published',
    publishedRevisionId: null,
    publicId: PUBLIC_ID,
    savedAt: new Date('2026-08-25T10:00:00.000Z'),
    submitterAttributionName: 'ผู้ส่งผลงาน',
    version: 1,
  };
}
