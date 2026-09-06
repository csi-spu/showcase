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

  listFilterOptions() {
    return Promise.resolve({ entryYears: [2566], workYears: [2569] });
  }

  listPeople() {
    return Promise.resolve({
      items: [
        {
          bio: 'สนใจระบบเว็บที่ใช้งานง่าย',
          entryYear: 2566,
          firstName: 'ณัฐดนัย',
          lastName: 'สุขใจ',
          photo: null,
          publicId: PROFILE_PUBLIC_ID,
          publishedWorkCount: 1,
        },
      ],
      totalCount: 1,
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

  listWorks(input: Parameters<CatalogRepository['listWorks']>[0]) {
    const allItems = [workItem(1), workItem(2), workItem(3)];
    const { limit, page } = input.query;
    const offset = (page - 1) * limit;
    return Promise.resolve({
      items: allItems.slice(offset, offset + limit),
      totalCount: allItems.length,
    });
  }

  suggestTags() {
    return Promise.resolve([
      { activeWorkCount: 1, displayLabel: 'React', publicId: TAG_PUBLIC_ID },
    ]);
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

  it('serves bounded, offset-addressable Work pages without private identifiers', async () => {
    const response = await request(app.getHttpServer()).get('/v1/public/works?limit=1').expect(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
    );
    expect(response.headers['cache-tag']).toBe('showcase-catalog,showcase-catalog-works');
    expect(response.headers.etag).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      hasNextPage: true,
      items: [{ title: 'Work 1' }],
      nextCursor: null,
      page: 1,
      pageSize: 1,
      totalCount: 3,
      totalPages: 3,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/studentId|accountId|personId|description/i);

    await request(app.getHttpServer())
      .get('/v1/public/works?limit=1')
      .set('If-None-Match', `"unrelated", W/${response.headers.etag as string}`)
      .expect(304);
  });

  it('serves distinct, directly addressable Work pages via ?page and rejects invalid page values', async () => {
    const pageTwo = await request(app.getHttpServer())
      .get('/v1/public/works?limit=1&page=2')
      .expect(200);
    expect(pageTwo.body).toMatchObject({
      hasNextPage: true,
      items: [{ title: 'Work 2' }],
      page: 2,
      totalPages: 3,
    });

    const lastPage = await request(app.getHttpServer())
      .get('/v1/public/works?limit=1&page=3')
      .expect(200);
    expect(lastPage.body).toMatchObject({ hasNextPage: false, items: [{ title: 'Work 3' }] });

    await request(app.getHttpServer())
      .get('/v1/public/works?page=0')
      .expect(400)
      .expect({ error: { code: 'CATALOG_PAGE_INVALID' } });
    await request(app.getHttpServer())
      .get('/v1/public/works?page=abc')
      .expect(400)
      .expect({ error: { code: 'CATALOG_PAGE_INVALID' } });
  });

  it('uses no-store for search', async () => {
    const first = await request(app.getHttpServer())
      .get('/v1/public/works?limit=1&q=react')
      .expect(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    await request(app.getHttpServer())
      .get('/v1/public/works?unknown=private')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('validates Public Profile filters and never shares their responses', async () => {
    await request(app.getHttpServer())
      .get(`/v1/public/works?profile=${PROFILE_PUBLIC_ID}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    await request(app.getHttpServer())
      .get('/v1/public/works?profile=not-a-uuid')
      .expect(400)
      .expect({ error: { code: 'CATALOG_PROFILE_INVALID' } });
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

  it('serves cacheable Public Catalog filter options', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/filter-options')
      .expect('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60')
      .expect('Cache-Tag', 'showcase-catalog,showcase-catalog-works,showcase-catalog-people')
      .expect(200)
      .expect({ entryYears: [2566], workYears: [2569] });
  });

  it('serves bounded Published Tag suggestions without shared caching', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/tags/suggestions?q=reac')
      .expect('Cache-Control', 'private, no-store')
      .expect(200)
      .expect([{ activeWorkCount: 1, displayLabel: 'React', publicId: TAG_PUBLIC_ID }]);
    await request(app.getHttpServer())
      .get('/v1/public/tags/suggestions?q=r')
      .expect(400)
      .expect({ error: { code: 'CATALOG_TAG_SUGGESTION_QUERY_INVALID' } });
    await request(app.getHttpServer())
      .get('/v1/public/tags/suggestions?q=reac&unknown=value')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
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

function workItem(index: number) {
  const publicId = index === 1 ? WORK_PUBLIC_ID : id(10 + index);
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    attributions: ['ผู้สร้าง'],
    category: 'course_work' as const,
    poster: null,
    publishedAt: `2026-08-26T00:00:0${index}.000Z`,
    summary: `Summary ${index}`,
    tags: [],
    title: `Work ${index}`,
    workPublicId: publicId,
  };
}

function id(index: number): string {
  return `98000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function requiredArrayProperty(value: unknown, key: string): unknown[] {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_TEST_RESPONSE');
  const property = Reflect.get(value, key) as unknown;
  if (!Array.isArray(property)) throw new Error('INVALID_TEST_RESPONSE');
  return property;
}
