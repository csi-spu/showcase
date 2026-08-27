import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../src/modules/catalog/application/catalog.ports';

const WORK_PUBLIC_ID = id(1);
const PROFILE_PUBLIC_ID = id(2);
const TAG_PUBLIC_ID = id(3);

class E2eCatalogRepository implements CatalogRepository {
  findTag() {
    return Promise.resolve({ activeWorkCount: 1, displayLabel: 'React', publicId: TAG_PUBLIC_ID });
  }

  getCacheVersion() {
    return Promise.resolve('42');
  }

  listPeople() {
    return Promise.resolve({
      entries: [
        {
          item: {
            bio: 'สนใจระบบเว็บที่ใช้งานง่าย',
            displayName: 'ณัฐดนัย',
            entryYear: 2566,
            photo: null,
            publicId: PROFILE_PUBLIC_ID,
            publishedWorkCount: 1,
          },
          position: { name: 'ณัฐดนัย', publicId: PROFILE_PUBLIC_ID },
        },
      ],
    });
  }

  listPopularTags() {
    return Promise.resolve([
      { activeWorkCount: 1, displayLabel: 'React', publicId: TAG_PUBLIC_ID },
    ]);
  }

  listSitemapEntries() {
    return Promise.resolve([{ lastModified: null, publicId: WORK_PUBLIC_ID }]);
  }

  listWorks() {
    return Promise.resolve({
      entries: [workEntry(1), workEntry(2)],
    });
  }
}

describe('Public Catalog HTTP contract (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CATALOG_REPOSITORY)
      .useValue(new E2eCatalogRepository())
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('serves bounded Work pages without totals or private identifiers', async () => {
    const response = await request(app.getHttpServer()).get('/v1/public/works?limit=1').expect(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
    );
    expect(response.headers['cache-tag']).toBe('showcase-catalog,showcase-catalog-works');
    expect(response.headers.etag).toEqual(expect.any(String));
    expect(response.body).toMatchObject({ hasNextPage: true, items: [{ title: 'Work 1' }] });
    expect(response.body).not.toHaveProperty('total');
    expect(JSON.stringify(response.body)).not.toMatch(/studentId|accountId|personId|description/i);

    await request(app.getHttpServer())
      .get('/v1/public/works?limit=1')
      .set('If-None-Match', `"unrelated", W/${response.headers.etag as string}`)
      .expect(304);
  });

  it('uses no-store and rejects cursor reuse for search', async () => {
    const first = await request(app.getHttpServer())
      .get('/v1/public/works?limit=1&q=react')
      .expect(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    const nextCursor = requiredStringProperty(first.body as unknown, 'nextCursor');
    await request(app.getHttpServer())
      .get(`/v1/public/works?limit=1&q=vue&cursor=${encodeURIComponent(nextCursor)}`)
      .expect(400)
      .expect({ error: { code: 'CATALOG_CURSOR_MISMATCH' } });
    await request(app.getHttpServer())
      .get('/v1/public/works?unknown=private')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('serves only repository-authorized People and active Tags', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/people')
      .expect(200)
      .expect((response) => {
        const body = response.body as unknown;
        expect(requiredArrayProperty(body, 'items')).toEqual([
          expect.objectContaining({
            bio: 'สนใจระบบเว็บที่ใช้งานง่าย',
            publicId: PROFILE_PUBLIC_ID,
          }),
        ]);
      });
    await request(app.getHttpServer())
      .get('/v1/public/tags/popular')
      .expect(200)
      .expect([{ activeWorkCount: 1, displayLabel: 'React', publicId: TAG_PUBLIC_ID }]);
    await request(app.getHttpServer())
      .get(`/v1/public/tags/${TAG_PUBLIC_ID}`)
      .expect(200)
      .expect({ activeWorkCount: 1, displayLabel: 'React', publicId: TAG_PUBLIC_ID });
  });

  it('serves bounded sitemap shards and validates their route shape', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/sitemap/works/98')
      .expect(200)
      .expect([{ lastModified: null, publicId: WORK_PUBLIC_ID }]);
    await request(app.getHttpServer()).get('/v1/public/sitemap/private/98').expect(400);
    await request(app.getHttpServer()).get('/v1/public/sitemap/works/xyz').expect(400);
  });

  it('serves the current public validator version without shared caching', async () => {
    await request(app.getHttpServer())
      .get('/v1/internal/visitor/cache-version')
      .set('x-visitor-cache-secret', 'local-development-only-visitor-cache-secret')
      .expect('Cache-Control', 'private, no-store')
      .expect(200)
      .expect({ version: '42' });
    await request(app.getHttpServer()).get('/v1/internal/visitor/cache-version').expect(403);
  });
});

function workEntry(index: number) {
  const publicId = index === 1 ? WORK_PUBLIC_ID : id(10 + index);
  return {
    item: {
      academicPeriod: { semester: '1' as const, year: 2569 },
      attributions: ['ผู้สร้าง'],
      category: 'course_work' as const,
      poster: null,
      publishedAt: `2026-08-26T00:00:0${index}.000Z`,
      summary: `Summary ${index}`,
      tags: [],
      title: `Work ${index}`,
      workPublicId: publicId,
    },
    position: {
      publishedAt: `2026-08-26T00:00:0${index}.000Z`,
      publicId,
    },
  };
}

function id(index: number): string {
  return `98000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function requiredStringProperty(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_TEST_RESPONSE');
  const property = Reflect.get(value, key) as unknown;
  if (typeof property !== 'string') throw new Error('INVALID_TEST_RESPONSE');
  return property;
}

function requiredArrayProperty(value: unknown, key: string): unknown[] {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_TEST_RESPONSE');
  const property = Reflect.get(value, key) as unknown;
  if (!Array.isArray(property)) throw new Error('INVALID_TEST_RESPONSE');
  return property;
}
