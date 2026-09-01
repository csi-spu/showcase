import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import {
  PublicationError,
  PublicationService,
} from '../src/modules/works/application/publication.service';
import type { PublicWorkView } from '../src/modules/works/application/publication.ports';

const WORK_PUBLIC_ID = '85000000-0000-4000-8000-000000000001';
const REVISION_ONE_ASSET_ID = '85000000-0000-4000-8000-000000000002';
const REVISION_THREE_ASSET_ID = '85000000-0000-4000-8000-000000000003';

describe('public Published Revision visibility during re-review (e2e)', () => {
  let app: INestApplication<App>;
  let stage: 'pending' | 'changes_requested' | 'published';
  const publication = {
    getPublicWork: jest.fn<Promise<PublicWorkView>, [string]>(),
    getPublicMedia: jest.fn<Promise<{ url: string }>, [string, string, number]>(),
  };

  beforeEach(async () => {
    stage = 'pending';
    publication.getPublicWork.mockImplementation(() =>
      Promise.resolve(stage === 'published' ? revisionThree() : revisionOne()),
    );
    publication.getPublicMedia.mockImplementation((_workPublicId, assetId) => {
      const visibleAssetId =
        stage === 'published' ? REVISION_THREE_ASSET_ID : REVISION_ONE_ASSET_ID;
      if (assetId !== visibleAssetId) {
        return Promise.reject(new PublicationError('PUBLIC_WORK_NOT_FOUND', 404));
      }
      return Promise.resolve({
        url:
          assetId === REVISION_THREE_ASSET_ID
            ? 'https://media.test/revision-three'
            : 'https://media.test/revision-one',
      });
    });
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PublicationService)
      .useValue(publication)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('keeps only Revision 1 and its media public while a replacement is pending or changes-requested', async () => {
    for (const reviewState of ['pending', 'changes_requested'] as const) {
      stage = reviewState;
      const work = await request(app.getHttpServer())
        .get(`/v1/public/works/${WORK_PUBLIC_ID}`)
        .expect(200);
      expect(work.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
      );
      expect(work.body).toMatchObject({ revisionNumber: 1, title: 'ฉบับเผยแพร่เดิม' });
      expect(JSON.stringify(work.body)).not.toMatch(
        /draft|pending|changes_requested|studentId|accountId|personId|privateObjectKey|credential|token|secret/i,
      );

      const publicMedia = await request(app.getHttpServer())
        .get(`/v1/public/works/${WORK_PUBLIC_ID}/media/${REVISION_ONE_ASSET_ID}/variants/480`)
        .expect(200);
      expect(publicMedia.headers['cache-control']).toBe('private, no-store');
      expect(publicMedia.body).toEqual({ url: 'https://media.test/revision-one' });
      expect(JSON.stringify(publicMedia.body)).not.toMatch(/work-media|privateObjectKey/i);
      await request(app.getHttpServer())
        .get(`/v1/public/works/${WORK_PUBLIC_ID}/media/${REVISION_THREE_ASSET_ID}/variants/480`)
        .expect(404)
        .expect({ error: { code: 'PUBLIC_WORK_NOT_FOUND' } });
    }
  });

  it('exposes only corrected Revision 3 after atomic approval', async () => {
    stage = 'published';
    const work = await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}`)
      .expect(200);
    expect(work.body).toMatchObject({ revisionNumber: 3, title: 'ฉบับแก้ไขสมบูรณ์' });
    expect(JSON.stringify(work.body)).not.toMatch(
      /revisionOne|draft|studentId|accountId|personId|privateObjectKey|credential|token|secret/i,
    );
    const publicMedia = await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}/media/${REVISION_THREE_ASSET_ID}/variants/480`)
      .expect(200);
    expect(publicMedia.headers['cache-control']).toBe('private, no-store');
    expect(publicMedia.body).toEqual({ url: 'https://media.test/revision-three' });
    expect(JSON.stringify(publicMedia.body)).not.toMatch(/work-media|privateObjectKey/i);
    await request(app.getHttpServer())
      .get(`/v1/public/works/${WORK_PUBLIC_ID}/media/${REVISION_ONE_ASSET_ID}/variants/480`)
      .expect(404)
      .expect({ error: { code: 'PUBLIC_WORK_NOT_FOUND' } });
  });
});

function revisionOne(): PublicWorkView {
  return publicRevision(1, 'ฉบับเผยแพร่เดิม', REVISION_ONE_ASSET_ID);
}

function revisionThree(): PublicWorkView {
  return publicRevision(3, 'ฉบับแก้ไขสมบูรณ์', REVISION_THREE_ASSET_ID);
}

function publicRevision(revisionNumber: number, title: string, assetId: string): PublicWorkView {
  return {
    academicPeriod: { semester: '1', year: 2569 },
    attributions: [
      {
        affiliation: null,
        attributionPublicId: '85000000-0000-4000-8000-000000000004',
        attributionName: 'ชื่อผู้ส่ง snapshot',
        canRequestRemoval: false,
        contributionRole: null,
        profilePublicId: null,
        studyYear: 3,
      },
    ],
    category: 'course_work',
    description: revisionNumber === 1 ? 'รายละเอียดเดิม' : 'รายละเอียดแก้ไข',
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/work' }],
    media: [
      {
        assetId,
        dominantColor: '#285078',
        height: 1_800,
        kind: 'poster',
        position: 1,
        variants: [{ height: 720, width: 480 }],
        width: 1_200,
      },
    ],
    publishedAt: '2026-08-25T18:00:00.000Z',
    revisionNumber,
    summary: revisionNumber === 1 ? 'สรุปเดิม' : 'สรุปแก้ไข',
    tags: [
      {
        displayLabel: revisionNumber === 1 ? 'React' : 'Vue',
        publicId: '85000000-0000-4000-8000-000000000005',
      },
    ],
    title,
    videoLinks: [
      {
        provider: 'youtube',
        providerVideoId: revisionNumber === 1 ? 'old-video' : 'new-video',
        url: `https://www.youtube.com/watch?v=${revisionNumber === 1 ? 'old-video' : 'new-video'}`,
      },
    ],
    workPublicId: WORK_PUBLIC_ID,
  };
}
