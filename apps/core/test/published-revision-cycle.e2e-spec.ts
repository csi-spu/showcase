import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import {
  PUBLICATION_REPOSITORY,
  type PublicationRepository,
  type PublicWorkView,
} from '../src/modules/works/application/publication.ports';
import {
  WORK_REVISIONS_REPOSITORY,
  type ReviewQueuePage,
  type WorkRevisionRepository,
  type WorkRevisionResult,
  type WorkRevisionView,
} from '../src/modules/works/application/work-revisions.ports';
import {
  WORKS_CLOCK,
  WORKS_REPOSITORY,
  type WorkDraftView,
  type WorkMutationResult,
  type WorksRepository,
} from '../src/modules/works/application/works.ports';

const STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const STUDENT_ACCOUNT_ID = '8b000000-0000-4000-8000-000000000001';
const ADMIN_ACCOUNT_ID = '8b000000-0000-4000-8000-000000000002';
const PERSON_ID = '8b000000-0000-4000-8000-000000000003';
const WORK_PUBLIC_ID = '8b000000-0000-4000-8000-000000000004';
const FIRST_REVISION_ID = '8b000000-0000-4000-8000-000000000005';
const SECOND_REVISION_PUBLIC_ID = '8b000000-0000-4000-8000-000000000006';
const SEED_KEY = '8b000000-0000-4000-8000-000000000007';
const SUBMIT_KEY = '8b000000-0000-4000-8000-000000000008';
const APPROVE_KEY = '8b000000-0000-4000-8000-000000000009';
const NOW = new Date('2026-08-26T04:00:00.000Z');

class LifecycleWorksRepository implements WorksRepository {
  draft: WorkDraftView | null = null;

  archiveSavedDraft(): ReturnType<WorksRepository['archiveSavedDraft']> {
    return Promise.resolve({ outcome: 'state_conflict' });
  }

  createWork(): Promise<WorkMutationResult> {
    return Promise.resolve({ outcome: 'draft_exists' });
  }

  findAuthoringContext() {
    return Promise.resolve({ currentAcademicYear: 2569, entryYear: 2566, personId: PERSON_ID });
  }

  findOwnedDraft(): Promise<WorkDraftView | null> {
    return Promise.resolve(this.draft);
  }

  findOwnedWorkState() {
    return Promise.resolve({
      activityState: 'active' as const,
      draft: this.draft,
      publicationState: 'published' as const,
      publishedRevisionId: FIRST_REVISION_ID,
      publicId: WORK_PUBLIC_ID,
    });
  }

  listOwnedWorks(): ReturnType<WorksRepository['listOwnedWorks']> {
    return Promise.resolve({
      hasNextPage: false,
      hasPreviousPage: false,
      items: [],
      nextCursor: null,
      previousCursor: null,
    });
  }

  getWorkspaceSummary(): ReturnType<WorksRepository['getWorkspaceSummary']> {
    return Promise.resolve({
      canMutate: true,
      changeRequestCount: 0,
      draftCount: this.draft === null ? 0 : 1,
      latestActionableDraftPublicId: this.draft?.publicId ?? null,
      pendingReviewCount: 0,
      publishedCount: 1,
      unreadNotificationCount: 0,
    });
  }

  patchDraft(): Promise<WorkMutationResult> {
    return Promise.resolve({ outcome: 'updated', work: this.requireDraft() });
  }

  rebaseDraft(): Promise<WorkMutationResult> {
    return Promise.resolve({ outcome: 'updated', work: this.requireDraft() });
  }

  restoreSavedDraft(): ReturnType<WorksRepository['restoreSavedDraft']> {
    return Promise.resolve({ outcome: 'state_conflict' });
  }

  seedDraft(): Promise<WorkMutationResult> {
    this.draft = draft();
    return Promise.resolve({ outcome: 'created', work: this.draft });
  }

  updateDraft(): Promise<WorkMutationResult> {
    return Promise.resolve({ outcome: 'updated', work: this.requireDraft() });
  }

  private requireDraft(): WorkDraftView {
    if (this.draft === null) throw new Error('DRAFT_NOT_SEEDED');
    return this.draft;
  }
}

class LifecycleRevisionRepository implements WorkRevisionRepository {
  pending: WorkRevisionView | null = null;

  findSubmissionContext() {
    return Promise.resolve({ currentAcademicYear: 2569, entryYear: 2566 });
  }

  findPendingRevision(): Promise<WorkRevisionView | null> {
    return Promise.resolve(this.pending);
  }

  findRevisionForReview(): Promise<WorkRevisionView | null> {
    return Promise.resolve(this.pending);
  }

  listReviewQueue(): Promise<ReviewQueuePage> {
    return Promise.resolve({ items: [], nextCursor: null });
  }

  submitRevision(): Promise<WorkRevisionResult> {
    this.pending = revision();
    return Promise.resolve({ outcome: 'created', revision: this.pending });
  }

  withdrawRevision(): Promise<WorkRevisionResult> {
    return Promise.resolve({ outcome: 'invalid_transition' });
  }
}

class LifecyclePublicationRepository implements PublicationRepository {
  current = publicWork(1);

  approveAndPublish(): ReturnType<PublicationRepository['approveAndPublish']> {
    this.current = publicWork(2);
    return Promise.resolve({
      outcome: 'published',
      publication: {
        publishedAt: new Date(NOW.getTime() + 2_000).toISOString(),
        revisionPublicId: SECOND_REVISION_PUBLIC_ID,
        revisionVersion: 2,
        workPublicId: WORK_PUBLIC_ID,
      },
    });
  }

  findPublicMediaObjectKey(): Promise<string | null> {
    return Promise.resolve(null);
  }

  findPublicWork(): Promise<PublicWorkView | null> {
    return Promise.resolve(this.current);
  }
}

describe('Student-to-Admin-to-Visitor newer Revision lifecycle (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const works = new LifecycleWorksRepository();
    const revisions = new LifecycleRevisionRepository();
    const publication = new LifecyclePublicationRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WORKS_REPOSITORY)
      .useValue(works)
      .overrideProvider(WORK_REVISIONS_REPOSITORY)
      .useValue(revisions)
      .overrideProvider(PUBLICATION_REPOSITORY)
      .useValue(publication)
      .overrideProvider(WORKS_CLOCK)
      .useValue({ now: () => NOW })
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeStudentMutation: () => Promise.resolve({ accountId: STUDENT_ACCOUNT_ID }),
      })
      .overrideProvider(AdminAuthService)
      .useValue({ authorizeAdmin: () => Promise.resolve({ accountId: ADMIN_ACCOUNT_ID }) })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps Revision 1 public until Admin approval commits Revision 2', async () => {
    await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}`)
      .expect(200)
      .expect((response) => expect(response.body).toMatchObject({ revisionNumber: 1 }));

    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/draft`)
      .send({ expectedPublishedRevisionId: FIRST_REVISION_ID, idempotencyKey: SEED_KEY })
      .expect(201);
    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/revisions`)
      .send({
        ...content('ฉบับเผยแพร่ใหม่'),
        expectedBasePublishedRevisionId: FIRST_REVISION_ID,
        expectedDraftVersion: 1,
        idempotencyKey: SUBMIT_KEY,
        studyYear: 3,
      })
      .expect(201)
      .expect((response) =>
        expect(response.body).toMatchObject({
          revision: { number: 2, status: 'pending_review' },
        }),
      );

    await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}`)
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({ revisionNumber: 1, title: 'ฉบับเผยแพร่เดิม' }),
      );

    await adminRequest(
      'post',
      `/v1/internal/admin/revisions/${SECOND_REVISION_PUBLIC_ID}/approve-and-publish`,
    )
      .send({ expectedRevisionVersion: 1, idempotencyKey: APPROVE_KEY })
      .expect(200);

    const visitor = await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}`)
      .expect(200);
    expect(visitor.body).toMatchObject({ revisionNumber: 2, title: 'ฉบับเผยแพร่ใหม่' });
    expect(JSON.stringify(visitor.body)).not.toMatch(/accountId|personId|studentId|pending/i);
  });

  function studentRequest(method: 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .set('Authorization', 'Bearer opaque-student-session');
  }

  function adminRequest(method: 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .set('Authorization', 'Bearer opaque-admin-session');
  }
});

function draft(): WorkDraftView {
  return {
    activityState: 'active',
    basePublishedRevisionId: FIRST_REVISION_ID,
    contributors: [],
    draft: { ...content('ร่างฉบับใหม่'), submitterStudyYear: 4 },
    isComplete: true,
    media: [],
    publicationState: 'published',
    publishedRevisionId: FIRST_REVISION_ID,
    publicId: WORK_PUBLIC_ID,
    savedAt: NOW,
    submitterAttributionName: 'ชื่อผู้ส่งฉบับใหม่',
    version: 1,
  };
}

function revision(): WorkRevisionView {
  return {
    authorKind: 'student_submission',
    attributions: [
      {
        affiliation: null,
        attributionName: 'ชื่อผู้ส่งฉบับใหม่',
        contributionRole: null,
        kind: 'submitter',
        studyYear: 3,
      },
    ],
    content: content('ฉบับเผยแพร่ใหม่'),
    media: [],
    number: 2,
    publicId: SECOND_REVISION_PUBLIC_ID,
    status: 'pending_review',
    submittedAt: new Date(NOW.getTime() + 1_000).toISOString(),
    version: 1,
    withdrawnAt: null,
    workPublicId: WORK_PUBLIC_ID,
  };
}

function publicWork(number: 1 | 2): PublicWorkView {
  return {
    academicPeriod: { semester: number === 1 ? '1' : '2', year: 2569 },
    attributions: [
      {
        affiliation: null,
        attributionPublicId: SECOND_REVISION_PUBLIC_ID,
        attributionName: number === 1 ? 'ชื่อผู้ส่งเดิม' : 'ชื่อผู้ส่งฉบับใหม่',
        canRequestRemoval: false,
        contributionRole: null,
        profilePublicId: null,
        studyYear: number === 1 ? 2 : 3,
      },
    ],
    category: 'course_work',
    description: 'รายละเอียด',
    links: [],
    media: [],
    publishedAt: new Date(NOW.getTime() + number * 1_000).toISOString(),
    revisionNumber: number,
    summary: 'สรุป',
    tags: [],
    title: number === 1 ? 'ฉบับเผยแพร่เดิม' : 'ฉบับเผยแพร่ใหม่',
    videoLinks: [],
    workPublicId: WORK_PUBLIC_ID,
  };
}

function content(title: string) {
  return {
    academicPeriod: { semester: '2' as const, year: 2569 },
    category: 'course_work' as const,
    description: 'รายละเอียด',
    links: [],
    summary: 'สรุป',
    tags: [],
    title,
    videoLinks: [],
  };
}
