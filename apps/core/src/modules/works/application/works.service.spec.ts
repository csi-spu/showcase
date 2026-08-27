import type {
  WorkAuthoringContext,
  WorkDraftView,
  WorkListPage,
  WorkMutationResult,
  WorksRepository,
} from './works.ports';
import { WorkError, WorksService } from './works.service';

const NOW = new Date('2026-08-25T10:00:00.000Z');
const ACCOUNT_ID = '61000000-0000-4000-8000-000000000001';
const PERSON_ID = '61000000-0000-4000-8000-000000000002';
const PUBLIC_ID = '61000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '61000000-0000-4000-8000-000000000004';
const REVISION_ID = '61000000-0000-4000-8000-000000000005';

class FakeWorksRepository implements WorksRepository {
  context: WorkAuthoringContext | null = {
    currentAcademicYear: 2569,
    entryYear: 2566,
    personId: PERSON_ID,
  };
  draft: WorkDraftView | null = null;
  mutationResult: WorkMutationResult = { outcome: 'updated', work: workDraft() };
  lastCreate: Parameters<WorksRepository['createWork']>[0] | undefined;
  lastRebase: Parameters<WorksRepository['rebaseDraft']>[0] | undefined;
  lastSeed: Parameters<WorksRepository['seedDraft']>[0] | undefined;
  lastUpdate: Parameters<WorksRepository['updateDraft']>[0] | undefined;
  listPage: WorkListPage = { items: [], nextCursor: null };
  lastList: Parameters<WorksRepository['listOwnedWorks']>[0] | undefined;

  createWork(input: Parameters<WorksRepository['createWork']>[0]) {
    this.lastCreate = input;
    return Promise.resolve(this.mutationResult);
  }

  findAuthoringContext(): Promise<WorkAuthoringContext | null> {
    return Promise.resolve(this.context);
  }

  findOwnedDraft(): Promise<WorkDraftView | null> {
    return Promise.resolve(this.draft);
  }

  findOwnedWorkState() {
    return Promise.resolve({
      activityState: 'active' as const,
      draft: this.draft,
      publicationState: 'published' as const,
      publishedRevisionId: REVISION_ID,
      publicId: PUBLIC_ID,
    });
  }

  listOwnedWorks(input: Parameters<WorksRepository['listOwnedWorks']>[0]) {
    this.lastList = input;
    return Promise.resolve(this.listPage);
  }

  rebaseDraft(input: Parameters<WorksRepository['rebaseDraft']>[0]) {
    this.lastRebase = input;
    return Promise.resolve(this.mutationResult);
  }

  seedDraft(input: Parameters<WorksRepository['seedDraft']>[0]) {
    this.lastSeed = input;
    return Promise.resolve(this.mutationResult);
  }

  updateDraft(input: Parameters<WorksRepository['updateDraft']>[0]) {
    this.lastUpdate = input;
    return Promise.resolve(this.mutationResult);
  }
}

describe('WorksService', () => {
  let repository: FakeWorksRepository;
  let service: WorksService;

  beforeEach(() => {
    repository = new FakeWorksRepository();
    service = new WorksService(repository, { now: () => NOW });
  });

  it('creates a private Work Draft with one immutable Submitter', async () => {
    repository.mutationResult = { outcome: 'created', work: workDraft() };

    await expect(
      service.createWork({
        actorAccountId: ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        ...input(),
      }),
    ).resolves.toEqual(repository.mutationResult);

    expect(repository.lastCreate).toEqual({
      actorAccountId: ACCOUNT_ID,
      draft: normalizedDraft(),
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      submitterPersonId: PERSON_ID,
    });
  });

  it('rejects authoring without a Current Academic Year or valid bounded fields', async () => {
    repository.context = { currentAcademicYear: null, entryYear: 2566, personId: PERSON_ID };
    await expect(
      service.createWork({
        actorAccountId: ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        ...input(),
      }),
    ).rejects.toMatchObject({ code: 'WORK_AUTHORING_FORBIDDEN', status: 403 });

    repository.context = { currentAcademicYear: 2569, entryYear: 2566, personId: PERSON_ID };
    await expect(
      service.createWork({
        actorAccountId: ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        ...input({ title: ' ' }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WORK_DRAFT', status: 422 });
  });

  it('reveals an owned Draft only to the resolved Submitter', async () => {
    await expect(service.getDraft(ACCOUNT_ID, PUBLIC_ID)).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
      status: 404,
    });

    repository.draft = workDraft();
    await expect(service.getDraft(ACCOUNT_ID, PUBLIC_ID)).resolves.toEqual(repository.draft);
  });

  it('returns only the safe Academic Period bounds for authoring UI', async () => {
    await expect(service.getAuthoringContext(ACCOUNT_ID)).resolves.toEqual({
      currentAcademicYear: 2569,
      entryYear: 2566,
    });
  });

  it('lists a bounded page of Submitter-owned Works using an opaque keyset cursor', async () => {
    repository.listPage = {
      items: [
        {
          activityState: 'active',
          hasDraft: true,
          latestRevisionStatus: 'changes_requested',
          publicationState: 'published',
          publicId: PUBLIC_ID,
          title: 'ระบบจัดการกิจกรรม',
          updatedAt: new Date('2026-08-25T09:00:00.000Z'),
        },
      ],
      nextCursor: {
        publicId: PUBLIC_ID,
        updatedAt: new Date('2026-08-25T09:00:00.000Z'),
      },
    };

    const page = await service.listOwnedWorks({ accountId: ACCOUNT_ID, limit: 20 });

    expect(repository.lastList).toEqual({ accountId: ACCOUNT_ID, cursor: null, limit: 20 });
    expect(page.items).toEqual([
      expect.objectContaining({
        publicId: PUBLIC_ID,
        title: 'ระบบจัดการกิจกรรม',
        updatedAt: '2026-08-25T09:00:00.000Z',
      }),
    ]);
    expect(typeof page.nextCursor).toBe('string');
  });

  it('rejects a malformed owned Work cursor without querying the repository', async () => {
    await expect(
      service.listOwnedWorks({ accountId: ACCOUNT_ID, cursor: 'not-a-cursor', limit: 20 }),
    ).rejects.toMatchObject({ code: 'INVALID_WORK_CURSOR', status: 422 });
    expect(repository.lastList).toBeUndefined();
  });

  it('updates normalized Draft content using the expected version', async () => {
    await expect(
      service.updateDraft({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
        ...input({ tags: ['  TypeScript  '] }),
      }),
    ).resolves.toEqual(repository.mutationResult);

    expect(repository.lastUpdate).toEqual({
      actorAccountId: ACCOUNT_ID,
      draft: normalizedDraft({
        tags: [{ displayLabel: 'TypeScript', normalizedIdentity: 'typescript' }],
      }),
      expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      publicId: PUBLIC_ID,
    });
  });

  it('seeds a private Draft from the expected Published Revision', async () => {
    repository.mutationResult = { outcome: 'created', work: publishedDraft() };

    await expect(
      service.seedPublishedDraft({
        actorAccountId: ACCOUNT_ID,
        expectedPublishedRevisionId: REVISION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
      }),
    ).resolves.toEqual(repository.mutationResult);
    expect(repository.lastSeed).toEqual({
      actorAccountId: ACCOUNT_ID,
      expectedPublishedRevisionId: REVISION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      publicId: PUBLIC_ID,
    });
  });

  it('rebases only the Draft base through an optimistic explicit command', async () => {
    repository.mutationResult = { outcome: 'updated', work: publishedDraft() };

    await expect(
      service.rebaseDraft({
        actorAccountId: ACCOUNT_ID,
        expectedPublishedRevisionId: REVISION_ID,
        expectedVersion: 3,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
      }),
    ).resolves.toEqual(repository.mutationResult);
    expect(repository.lastRebase).toEqual({
      actorAccountId: ACCOUNT_ID,
      expectedPublishedRevisionId: REVISION_ID,
      expectedVersion: 3,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      publicId: PUBLIC_ID,
    });
  });

  it('denies Published Draft seed and rebase when Student authoring is no longer eligible', async () => {
    repository.context = { currentAcademicYear: null, entryYear: 2566, personId: PERSON_ID };

    await expect(
      service.seedPublishedDraft({
        actorAccountId: ACCOUNT_ID,
        expectedPublishedRevisionId: REVISION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
      }),
    ).rejects.toMatchObject({ code: 'WORK_AUTHORING_FORBIDDEN', status: 403 });
    await expect(
      service.rebaseDraft({
        actorAccountId: ACCOUNT_ID,
        expectedPublishedRevisionId: REVISION_ID,
        expectedVersion: 3,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
      }),
    ).rejects.toMatchObject({ code: 'WORK_AUTHORING_FORBIDDEN', status: 403 });
    expect(repository.lastSeed).toBeUndefined();
    expect(repository.lastRebase).toBeUndefined();
  });

  it.each([
    ['draft_exists', 'WORK_DRAFT_EXISTS'],
    ['idempotency_conflict', 'WORK_IDEMPOTENCY_CONFLICT'],
    ['not_found', 'WORK_NOT_FOUND'],
    ['pending_revision_exists', 'WORK_PENDING_REVISION_EXISTS'],
    ['published_revision_conflict', 'WORK_BASE_REVISION_CONFLICT'],
    ['version_conflict', 'WORK_VERSION_CONFLICT'],
    ['work_not_published', 'WORK_NOT_PUBLISHED'],
  ] as const)('maps %s without overwriting either Draft', async (outcome, code) => {
    repository.mutationResult = { outcome };
    await expect(
      service.updateDraft({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        publicId: PUBLIC_ID,
        ...input(),
      }),
    ).rejects.toMatchObject({ code, status: outcome === 'not_found' ? 404 : 409 });
  });

  it('uses stable application errors', () => {
    expect(new WorkError('WORK_NOT_FOUND', 404)).toMatchObject({
      code: 'WORK_NOT_FOUND',
      name: 'WorkError',
      status: 404,
    });
  });
});

function input(overrides: Partial<ReturnType<typeof inputBase>> = {}) {
  return { ...inputBase(), ...overrides };
}

function inputBase() {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    category: 'course_work' as const,
    description: 'รายละเอียดผลงาน',
    links: [{ label: 'เว็บไซต์', url: 'https://example.com' }],
    summary: 'สรุปผลงาน',
    tags: ['React'],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
  };
}

function normalizedDraft(overrides: Partial<ReturnType<typeof normalizedDraftBase>> = {}) {
  return { ...normalizedDraftBase(), ...overrides };
}

function normalizedDraftBase() {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    category: 'course_work' as const,
    description: 'รายละเอียดผลงาน',
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
    summary: 'สรุปผลงาน',
    tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
  };
}

function workDraft(): WorkDraftView {
  return {
    activityState: 'active',
    basePublishedRevisionId: null,
    draft: normalizedDraft(),
    publicationState: 'never_published',
    publishedRevisionId: null,
    publicId: PUBLIC_ID,
    version: 1,
  };
}

function publishedDraft(): WorkDraftView {
  return {
    ...workDraft(),
    basePublishedRevisionId: REVISION_ID,
    publicationState: 'published',
    publishedRevisionId: REVISION_ID,
  };
}
