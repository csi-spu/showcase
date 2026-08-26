import { caseFold } from 'unicode-case-folding';
import { WORK_CATEGORIES, WORK_SEMESTERS } from '../../works/domain/work-draft-policy';

const PAGE_SIZE_DEFAULT = 24;
const PAGE_SIZE_MAXIMUM = 48;
const QUERY_MAXIMUM_LENGTH = 100;
const QUERY_MINIMUM_LENGTH = 2;
const TAG_LIMIT = 5;
const ACADEMIC_YEAR_MINIMUM = 2400;
const ACADEMIC_YEAR_MAXIMUM = 2700;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const WORK_SORTS = ['recent', 'academic_period', 'title'] as const;
const PEOPLE_SORTS = ['name'] as const;

type QueryValue = string | string[] | undefined;

export interface RawWorkCatalogQuery {
  category?: QueryValue;
  limit?: QueryValue;
  q?: QueryValue;
  semester?: QueryValue;
  sort?: QueryValue;
  tag?: QueryValue;
  year?: QueryValue;
}

export interface RawPeopleCatalogQuery {
  entryYear?: QueryValue;
  limit?: QueryValue;
  q?: QueryValue;
  sort?: QueryValue;
}

export interface WorkCatalogQuery {
  categories: Array<(typeof WORK_CATEGORIES)[number]>;
  limit: number;
  query: string | null;
  semester: (typeof WORK_SEMESTERS)[number] | null;
  sort: (typeof WORK_SORTS)[number] | 'relevance';
  tagPublicIds: string[];
  year: number | null;
}

export interface PeopleCatalogQuery {
  entryYear: number | null;
  limit: number;
  query: string | null;
  sort: (typeof PEOPLE_SORTS)[number] | 'relevance';
}

export type CatalogQueryErrorCode =
  | 'CATALOG_CATEGORY_INVALID'
  | 'CATALOG_ENTRY_YEAR_INVALID'
  | 'CATALOG_LIMIT_INVALID'
  | 'CATALOG_QUERY_LENGTH'
  | 'CATALOG_QUERY_SHAPE_INVALID'
  | 'CATALOG_SEMESTER_INVALID'
  | 'CATALOG_SORT_INVALID'
  | 'CATALOG_TAG_INVALID'
  | 'CATALOG_TAG_LIMIT'
  | 'CATALOG_YEAR_INVALID';

export class CatalogQueryError extends Error {
  constructor(readonly code: CatalogQueryErrorCode) {
    super(code);
    this.name = 'CatalogQueryError';
  }
}

export function normalizeWorkCatalogQuery(input: RawWorkCatalogQuery): WorkCatalogQuery {
  const query = normalizeQuery(input.q);
  const categories = uniqueSortedValues(input.category);
  if (!categories.every(isWorkCategory)) fail('CATALOG_CATEGORY_INVALID');
  const tagPublicIds = uniqueSortedValues(input.tag);
  if (tagPublicIds.length > TAG_LIMIT) fail('CATALOG_TAG_LIMIT');
  if (!tagPublicIds.every((value) => UUID_V4_PATTERN.test(value))) fail('CATALOG_TAG_INVALID');

  const semesterRaw = scalar(input.semester, 'CATALOG_SEMESTER_INVALID');
  const semesterValue = semesterRaw === '' ? undefined : semesterRaw;
  if (semesterValue !== undefined && !isWorkSemester(semesterValue)) {
    fail('CATALOG_SEMESTER_INVALID');
  }
  const requestedSort = scalar(input.sort, 'CATALOG_SORT_INVALID') ?? 'recent';
  if (!isWorkSort(requestedSort)) fail('CATALOG_SORT_INVALID');

  return {
    categories,
    limit: normalizePageSize(input.limit),
    query,
    semester: semesterValue ?? null,
    sort: query === null ? requestedSort : 'relevance',
    tagPublicIds,
    year: normalizeAcademicYear(input.year, 'CATALOG_YEAR_INVALID'),
  };
}

export function normalizePeopleCatalogQuery(input: RawPeopleCatalogQuery): PeopleCatalogQuery {
  const query = normalizeQuery(input.q);
  const requestedSort = scalar(input.sort, 'CATALOG_SORT_INVALID') ?? 'name';
  if (requestedSort !== PEOPLE_SORTS[0]) fail('CATALOG_SORT_INVALID');
  return {
    entryYear: normalizeAcademicYear(input.entryYear, 'CATALOG_ENTRY_YEAR_INVALID'),
    limit: normalizePageSize(input.limit),
    query,
    sort: query === null ? requestedSort : 'relevance',
  };
}

function normalizeQuery(input: QueryValue): string | null {
  const value = scalar(input, 'CATALOG_QUERY_SHAPE_INVALID');
  if (value === undefined || value.trim().length === 0) return null;
  const normalized = normalizeCatalogSearchText(value);
  const length = Array.from(normalized).length;
  if (length < QUERY_MINIMUM_LENGTH || length > QUERY_MAXIMUM_LENGTH) {
    fail('CATALOG_QUERY_LENGTH');
  }
  return normalized;
}

export function normalizeCatalogSearchText(value: string): string {
  return caseFold(value.normalize('NFKC').trim().replace(/\s+/gu, ' '));
}

function normalizePageSize(input: QueryValue): number {
  const value = scalar(input, 'CATALOG_LIMIT_INVALID');
  if (value === undefined) return PAGE_SIZE_DEFAULT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PAGE_SIZE_MAXIMUM) {
    fail('CATALOG_LIMIT_INVALID');
  }
  return parsed;
}

function normalizeAcademicYear(
  input: QueryValue,
  errorCode: 'CATALOG_ENTRY_YEAR_INVALID' | 'CATALOG_YEAR_INVALID',
): number | null {
  const value = scalar(input, errorCode);
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < ACADEMIC_YEAR_MINIMUM ||
    parsed > ACADEMIC_YEAR_MAXIMUM
  ) {
    fail(errorCode);
  }
  return parsed;
}

function scalar<TError extends CatalogQueryErrorCode>(
  input: QueryValue,
  errorCode: TError,
): string | undefined {
  if (Array.isArray(input)) fail(errorCode);
  return input;
}

function uniqueSortedValues(input: QueryValue): string[] {
  const values = input === undefined ? [] : Array.isArray(input) ? input : [input];
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isWorkCategory(value: string): value is (typeof WORK_CATEGORIES)[number] {
  return WORK_CATEGORIES.some((category) => category === value);
}

function isWorkSemester(value: string): value is (typeof WORK_SEMESTERS)[number] {
  return WORK_SEMESTERS.some((semester) => semester === value);
}

function isWorkSort(value: string): value is (typeof WORK_SORTS)[number] {
  return WORK_SORTS.some((sort) => sort === value);
}

function fail(code: CatalogQueryErrorCode): never {
  throw new CatalogQueryError(code);
}
