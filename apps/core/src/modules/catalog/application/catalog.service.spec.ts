import type {
  CatalogRepository,
  CatalogSlice,
  PeopleCatalogCard,
  PublicTagView,
  WorkCatalogCard,
} from './catalog.ports';
import { CatalogCursorCodec } from '../domain/catalog-cursor';
import { CatalogService, isCatalogSharedCacheEligible } from './catalog.service';

const SECRET = 'catalog-cursor-secret-that-is-at-least-thirty-two-bytes';

class FakeCatalogRepository implements CatalogRepository {
  workSlice: CatalogSlice<WorkCatalogCard> = { entries: [] };
  peopleSlice: CatalogSlice<PeopleCatalogCard> = { entries: [] };
  popularTags: PublicTagView[] = [];
  tag: PublicTagView | null = null;
  lastWorkInput: Parameters<CatalogRepository['listWorks']>[0] | undefined;

  findTag(): Promise<PublicTagView | null> {
    return Promise.resolve(this.tag);
  }

  getCacheVersion(): Promise<string> {
    return Promise.resolve('42');
  }

  listPeople(): Promise<CatalogSlice<PeopleCatalogCard>> {
    return Promise.resolve(this.peopleSlice);
  }

  listPopularTags(): Promise<PublicTagView[]> {
    return Promise.resolve(this.popularTags);
  }

  listSitemapEntries() {
    return Promise.resolve([]);
  }

  listWorks(input: Parameters<CatalogRepository['listWorks']>[0]) {
    this.lastWorkInput = input;
    return Promise.resolve(this.workSlice);
  }
}

describe('CatalogService', () => {
  let repository: FakeCatalogRepository;
  let service: CatalogService;

  beforeEach(() => {
    repository = new FakeCatalogRepository();
    service = new CatalogService(repository, new CatalogCursorCodec(SECRET));
  });

  it('returns a bounded Work page and binds continuation to its normalized request', async () => {
    repository.workSlice = {
      entries: [workEntry(1), workEntry(2), workEntry(3)],
    };

    const firstPage = await service.listWorks({ limit: '2', q: '  REACT  ' }, undefined);
    expect(firstPage).toMatchObject({
      hasNextPage: true,
      items: [{ title: 'Work 1' }, { title: 'Work 2' }],
    });
    expect(firstPage).not.toHaveProperty('total');
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(repository.lastWorkInput).toMatchObject({
      after: null,
      query: { limit: 2, query: 'react', sort: 'relevance' },
    });

    repository.workSlice = { entries: [] };
    await service.listWorks({ limit: '2', q: 'react' }, firstPage.nextCursor ?? undefined);
    expect(repository.lastWorkInput?.after).toEqual({
      publishedAt: '2026-08-26T00:00:02.000Z',
      publicId: '95000000-0000-4000-8000-000000000002',
      rank: 2,
    });

    await expect(
      service.listWorks({ limit: '2', q: 'vue' }, firstPage.nextCursor ?? undefined),
    ).rejects.toMatchObject({ code: 'CATALOG_CURSOR_MISMATCH', status: 400 });
  });

  it('uses no-store for high-cardinality shapes and shared cache only for bounded first pages', () => {
    expect(isCatalogSharedCacheEligible({ cursor: null, query: null, tagCount: 0 })).toBe(true);
    expect(isCatalogSharedCacheEligible({ cursor: 'cursor', query: null, tagCount: 0 })).toBe(
      false,
    );
    expect(isCatalogSharedCacheEligible({ cursor: null, query: 'react', tagCount: 0 })).toBe(false);
    expect(isCatalogSharedCacheEligible({ cursor: null, query: null, tagCount: 2 })).toBe(false);
    expect(isCatalogSharedCacheEligible({ cursor: null, query: null, tagCount: 1 })).toBe(true);
  });

  it('hides an activated zero-count Tag behind uniform not-found', async () => {
    repository.tag = { activeWorkCount: 0, displayLabel: 'Retained', publicId: tagId(1) };
    await expect(service.getTag(tagId(1))).rejects.toMatchObject({
      code: 'PUBLIC_TAG_NOT_FOUND',
      status: 404,
    });
  });

  it('rejects an invalid sitemap bucket before persistence', async () => {
    await expect(service.listSitemapEntries('works', 256)).rejects.toMatchObject({
      code: 'CATALOG_SITEMAP_BUCKET_INVALID',
      status: 400,
    });
  });
});

function workEntry(index: number) {
  const suffix = String(index).padStart(12, '0');
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
      workPublicId: `95000000-0000-4000-8000-${suffix}`,
    },
    position: {
      publishedAt: `2026-08-26T00:00:0${index}.000Z`,
      publicId: `95000000-0000-4000-8000-${suffix}`,
      rank: index,
    },
  };
}

function tagId(index: number): string {
  return `96000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
