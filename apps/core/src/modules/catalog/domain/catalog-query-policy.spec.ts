import {
  CatalogQueryError,
  normalizePeopleCatalogQuery,
  normalizeWorkCatalogQuery,
  type RawWorkCatalogQuery,
} from './catalog-query-policy';

const INVALID_WORK_QUERIES: Array<[RawWorkCatalogQuery, CatalogQueryError['code']]> = [
  [{ q: 'ก' }, 'CATALOG_QUERY_LENGTH'],
  [{ q: '🙂' }, 'CATALOG_QUERY_LENGTH'],
  [{ q: 'ก'.repeat(101) }, 'CATALOG_QUERY_LENGTH'],
  [{ category: ['not-a-category'] }, 'CATALOG_CATEGORY_INVALID'],
  [{ tag: Array.from({ length: 6 }, (_, index) => uuid(index)) }, 'CATALOG_TAG_LIMIT'],
  [{ tag: ['not-a-uuid'] }, 'CATALOG_TAG_INVALID'],
  [{ profile: 'not-a-uuid' }, 'CATALOG_PROFILE_INVALID'],
  [{ profile: [uuid(1), uuid(2)] }, 'CATALOG_PROFILE_INVALID'],
  [{ semester: '3' }, 'CATALOG_SEMESTER_INVALID'],
  [{ year: '2399' }, 'CATALOG_YEAR_INVALID'],
  [{ year: '2701' }, 'CATALOG_YEAR_INVALID'],
  [{ limit: '49' }, 'CATALOG_LIMIT_INVALID'],
];

describe('Public Catalog query policy', () => {
  it('normalizes a Work query into one canonical bounded request', () => {
    expect(
      normalizeWorkCatalogQuery({
        category: ['competition_entry', 'course_work', 'course_work'],
        limit: '48',
        profile: uuid(4),
        q: '  ＲＥＡＣＴ   ระบบ  ',
        semester: 'summer',
        sort: 'title',
        tag: [
          '93000000-0000-4000-8000-000000000002',
          '93000000-0000-4000-8000-000000000001',
          '93000000-0000-4000-8000-000000000002',
        ],
        year: '2569',
      }),
    ).toEqual({
      categories: ['competition_entry', 'course_work'],
      limit: 48,
      query: 'react ระบบ',
      profilePublicId: uuid(4),
      semester: 'summer',
      sort: 'relevance',
      tagPublicIds: [
        '93000000-0000-4000-8000-000000000001',
        '93000000-0000-4000-8000-000000000002',
      ],
      year: 2569,
    });
  });

  it('applies browse defaults and omits absent filters', () => {
    expect(normalizeWorkCatalogQuery({ semester: '', year: '' })).toEqual({
      categories: [],
      limit: 24,
      query: null,
      profilePublicId: null,
      semester: null,
      sort: 'recent',
      tagPublicIds: [],
      year: null,
    });
    expect(normalizePeopleCatalogQuery({ entryYear: '' })).toEqual({
      entryYear: null,
      limit: 24,
      query: null,
      sort: 'name',
    });
  });

  it.each(INVALID_WORK_QUERIES)('rejects an invalid Work request with %s', (input, code) => {
    expectQueryError(() => normalizeWorkCatalogQuery(input), code);
  });

  it('rejects multiple scalar values instead of silently choosing one', () => {
    expectQueryError(
      () => normalizePeopleCatalogQuery({ entryYear: ['2568', '2569'] }),
      'CATALOG_ENTRY_YEAR_INVALID',
    );
  });

  it('forces relevance sorting whenever search is present', () => {
    expect(normalizePeopleCatalogQuery({ q: '  สมชาย  ', sort: 'name' })).toMatchObject({
      query: 'สมชาย',
      sort: 'relevance',
    });
  });
});

function uuid(index: number): string {
  return `93000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function expectQueryError(operation: () => unknown, code: CatalogQueryError['code']): void {
  try {
    operation();
    throw new Error('EXPECTED_QUERY_ERROR');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(CatalogQueryError);
    expect(error).toMatchObject({ code });
  }
}
