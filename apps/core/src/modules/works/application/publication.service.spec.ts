import type { PublicationRepository, PublicationResult, PublicWorkView } from './publication.ports';
import { PublicationService } from './publication.service';

const NOW = new Date('2026-08-25T18:00:00.000Z');
const ADMIN_ACCOUNT_ID = '82000000-0000-4000-8000-000000000001';
const REVISION_PUBLIC_ID = '82000000-0000-4000-8000-000000000002';
const WORK_PUBLIC_ID = '82000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '82000000-0000-4000-8000-000000000004';
const ASSET_ID = '82000000-0000-4000-8000-000000000005';

class FakePublicationRepository implements PublicationRepository {
  result: PublicationResult = { outcome: 'published', publication: publication() };
  publicWork: PublicWorkView | null = publicWork();
  mediaUrl: string | null = 'work-media/asset/480.webp';
  lastApproval: Parameters<PublicationRepository['approveAndPublish']>[0] | undefined;

  approveAndPublish(input: Parameters<PublicationRepository['approveAndPublish']>[0]) {
    this.lastApproval = input;
    return Promise.resolve(this.result);
  }

  findPublicMediaObjectKey(): Promise<string | null> {
    return Promise.resolve(this.mediaUrl);
  }

  findPublicWork(): Promise<PublicWorkView | null> {
    return Promise.resolve(this.publicWork);
  }
}

describe('PublicationService', () => {
  let repository: FakePublicationRepository;
  let mediaStorage: FakePublicMediaStorage;
  let service: PublicationService;

  beforeEach(() => {
    repository = new FakePublicationRepository();
    mediaStorage = new FakePublicMediaStorage();
    service = new PublicationService(repository, { now: () => NOW }, mediaStorage);
  });

  it('approves and publishes through one optimistic idempotent repository operation', async () => {
    await expect(
      service.approveAndPublish({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        revisionPublicId: REVISION_PUBLIC_ID,
      }),
    ).resolves.toEqual(repository.result);
    expect(repository.lastApproval).toEqual({
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedRevisionVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      revisionPublicId: REVISION_PUBLIC_ID,
    });
  });

  it.each([
    ['idempotency_conflict', 'WORK_IDEMPOTENCY_CONFLICT'],
    ['revision_not_found', 'WORK_REVISION_NOT_FOUND'],
    ['revision_state_conflict', 'WORK_REVISION_STATE_CONFLICT'],
    ['revision_version_conflict', 'WORK_REVISION_VERSION_CONFLICT'],
    ['work_state_conflict', 'WORK_PUBLICATION_STATE_CONFLICT'],
  ] as const)('maps %s to stable failure semantics', async (outcome, code) => {
    repository.result = { outcome };
    await expect(
      service.approveAndPublish({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        revisionPublicId: REVISION_PUBLIC_ID,
      }),
    ).rejects.toMatchObject({ code });
  });

  it('returns an equivalent approval retry as a replay', async () => {
    repository.result = { outcome: 'replayed', publication: publication() };

    await expect(
      service.approveAndPublish({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        revisionPublicId: REVISION_PUBLIC_ID,
      }),
    ).resolves.toEqual(repository.result);
    expect(repository.lastApproval?.idempotencyKey).toBe(IDEMPOTENCY_KEY);
  });

  it('returns only repository-authorized public Work and media', async () => {
    await expect(service.getPublicWork(WORK_PUBLIC_ID)).resolves.toEqual(publicWork());
    await expect(service.getPublicMedia(WORK_PUBLIC_ID, ASSET_ID, 480)).resolves.toEqual({
      url: 'https://r2.example.test/presigned-work-media',
    });
    expect(mediaStorage.lastInput).toEqual({
      expiresInSeconds: 60,
      key: 'work-media/asset/480.webp',
    });

    repository.publicWork = null;
    await expect(service.getPublicWork(WORK_PUBLIC_ID)).rejects.toMatchObject({
      code: 'PUBLIC_WORK_NOT_FOUND',
      status: 404,
    });
    repository.mediaUrl = null;
    await expect(service.getPublicMedia(WORK_PUBLIC_ID, ASSET_ID, 480)).rejects.toMatchObject({
      code: 'PUBLIC_WORK_NOT_FOUND',
      status: 404,
    });
  });

  it('maps public media signing failure without exposing provider details', async () => {
    mediaStorage.isUnavailable = true;

    await expect(service.getPublicMedia(WORK_PUBLIC_ID, ASSET_ID, 480)).rejects.toMatchObject({
      code: 'WORK_MEDIA_SERVICE_UNAVAILABLE',
      message: 'WORK_MEDIA_SERVICE_UNAVAILABLE',
      status: 503,
    });
  });
});

class FakePublicMediaStorage {
  isUnavailable = false;
  lastInput: { expiresInSeconds: number; key: string } | undefined;

  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string> {
    this.lastInput = input;
    if (this.isUnavailable) return Promise.reject(new Error('provider detail'));
    return Promise.resolve('https://r2.example.test/presigned-work-media');
  }
}

function publication() {
  return {
    publishedAt: NOW.toISOString(),
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
    publishedAt: NOW.toISOString(),
    revisionNumber: 1,
    summary: 'สรุปผลงาน',
    tags: [{ displayLabel: 'React', publicId: '82000000-0000-4000-8000-000000000006' }],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
    workPublicId: WORK_PUBLIC_ID,
  };
}
