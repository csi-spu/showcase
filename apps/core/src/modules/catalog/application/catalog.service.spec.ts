import type {
  CatalogRepository,
  CatalogSlice,
  PeopleCatalogCard,
  PublicTagView,
  WorkCatalogCard,
} from './catalog.ports';
import { CatalogService, isCatalogSharedCacheEligible } from './catalog.service';

class FakeCatalogRepository implements CatalogRepository {
  filterOptions = { entryYears: [] as number[], workYears: [] as number[] };
  workSlice: CatalogSlice<WorkCatalogCard> = { items: [], totalCount: 0 };
  peopleSlice: CatalogSlice<PeopleCatalogCard> = { items: [], totalCount: 0 };
  popularTags: PublicTagView[] = [];
  suggestedTags: PublicTagView[] = [];
  tag: PublicTagView | null = null;
  lastWorkInput: Parameters<CatalogRepository['listWorks']>[0] | undefined;
  lastTagSuggestionQuery: string | undefined;

  findTag(): Promise<PublicTagView | null> {
    return Promise.resolve(this.tag);
  }

  getCacheVersion(): Promise<string> {
    return Promise.resolve('42');
  }

  listFilterOptions() {
    return Promise.resolve(this.filterOptions);
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

  suggestTags(query: string): Promise<PublicTagView[]> {
    this.lastTagSuggestionQuery = query;
    return Promise.resolve(this.suggestedTags);
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
    service = new CatalogService(repository);
  });

  it('returns a bounded, offset-addressable Work page with correct total pages', async () => {
    repository.workSlice = {
      items: [workItem(1), workItem(2)],
      totalCount: 5,
    };

    const firstPage = await service.listWorks({ limit: '2', page: '1', q: '  REACT  ' });
    expect(firstPage).toMatchObject({
      items: [{ title: 'Work 1' }, { title: 'Work 2' }],
      page: 1,
      pageSize: 2,
      totalCount: 5,
      totalPages: 3,
      hasNextPage: true,
      nextCursor: null,
    });
    expect(repository.lastWorkInput).toMatchObject({
      query: { limit: 2, page: 1, query: 'react', sort: 'relevance' },
    });

    await service.listWorks({ limit: '2', page: '3', q: 'react' });
    expect(repository.lastWorkInput).toMatchObject({ query: { page: 3 } });
  });

  it('rounds totalPages up and reports no next page on the last page', async () => {
    repository.workSlice = { items: [workItem(1)], totalCount: 5 };
    const page = await service.listWorks({ limit: '2', page: '3' });
    expect(page).toMatchObject({ totalPages: 3, hasNextPage: false });
  });

  it('defaults to page 1 and returns empty items for a page beyond the last page', async () => {
    repository.workSlice = { items: [], totalCount: 5 };
    const defaulted = await service.listWorks({ limit: '2' });
    expect(repository.lastWorkInput).toMatchObject({ query: { page: 1 } });

    const beyond = await service.listWorks({ limit: '2', page: '99' });
    expect(beyond).toMatchObject({ items: [], page: 99, totalPages: 3 });
    expect(defaulted).toMatchObject({ page: 1 });
  });

  it('rejects an invalid page number', async () => {
    await expect(service.listWorks({ page: '0' })).rejects.toMatchObject({
      code: 'CATALOG_PAGE_INVALID',
      status: 400,
    });
    await expect(service.listWorks({ page: 'abc' })).rejects.toMatchObject({
      code: 'CATALOG_PAGE_INVALID',
      status: 400,
    });
  });

  it('uses no-store for high-cardinality shapes and shared cache only for cacheable filter shapes', () => {
    expect(isCatalogSharedCacheEligible({ profilePublicId: null, query: null, tagCount: 0 })).toBe(
      true,
    );
    expect(
      isCatalogSharedCacheEligible({ profilePublicId: null, query: 'react', tagCount: 0 }),
    ).toBe(false);
    expect(isCatalogSharedCacheEligible({ profilePublicId: null, query: null, tagCount: 2 })).toBe(
      false,
    );
    expect(isCatalogSharedCacheEligible({ profilePublicId: null, query: null, tagCount: 1 })).toBe(
      true,
    );
    expect(
      isCatalogSharedCacheEligible({
        profilePublicId: '93000000-0000-4000-8000-000000000001',
        query: null,
        tagCount: 0,
      }),
    ).toBe(false);
  });

  it('hides an activated zero-count Tag behind uniform not-found', async () => {
    repository.tag = { activeWorkCount: 0, displayLabel: 'Retained', publicId: tagId(1) };
    await expect(service.getTag(tagId(1))).rejects.toMatchObject({
      code: 'PUBLIC_TAG_NOT_FOUND',
      status: 404,
    });
  });

  it('returns the available Public Catalog filter years', async () => {
    repository.filterOptions = { entryYears: [2567, 2566], workYears: [2569, 2568] };

    await expect(service.listFilterOptions()).resolves.toEqual({
      entryYears: [2567, 2566],
      workYears: [2569, 2568],
    });
  });

  it('returns bounded normalized Published Tag suggestions', async () => {
    repository.suggestedTags = [
      { activeWorkCount: 3, displayLabel: 'React Native', publicId: tagId(1) },
    ];

    await expect(service.suggestTags('  ＲＥＡＣＴ  ')).resolves.toEqual(repository.suggestedTags);
    expect(repository.lastTagSuggestionQuery).toBe('react');
  });

  it('rejects an invalid sitemap bucket before persistence', async () => {
    await expect(service.listSitemapEntries('works', 256)).rejects.toMatchObject({
      code: 'CATALOG_SITEMAP_BUCKET_INVALID',
      status: 400,
    });
  });
});

function workItem(index: number): WorkCatalogCard {
  const suffix = String(index).padStart(12, '0');
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    attributions: ['ผู้สร้าง'],
    category: 'course_work' as const,
    poster: null,
    publishedAt: `2026-08-26T00:00:0${index}.000Z`,
    summary: `Summary ${index}`,
    tags: [],
    title: `Work ${index}`,
    workPublicId: `95000000-0000-4000-8000-${suffix}`,
  };
}

function tagId(index: number): string {
  return `96000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
