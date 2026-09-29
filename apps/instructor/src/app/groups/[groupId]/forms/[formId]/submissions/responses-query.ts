import { MAX_REVIEW_PAGE, REVIEW_SORTS } from '@/lib/instructor-collection-forms-contract';
import {
  REVIEW_PAGE_SIZES,
  REVIEW_STATUS_ORDER,
  type ReviewPageSize,
  type ReviewSort,
  type ReviewStatusFilter,
} from './review-queue-view';

export const RESPONSE_VIEWS = ['summary', 'question', 'individual'] as const;
export type ResponseView = (typeof RESPONSE_VIEWS)[number];

const REVIEW_STATUS_FILTERS: readonly ReviewStatusFilter[] = ['all', ...REVIEW_STATUS_ORDER];
/* A Field ID as Core accepts it; anything else is ignored rather than sent on. */
const FIELD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/u;
const MAX_OPTION_LENGTH = 200;

export type SearchParams = Record<string, string | string[] | undefined>;

/** Where the Individual index is: what it is filtered to, its order, and its page. */
export interface IndividualQuery {
  page: number;
  pageSize: ReviewPageSize;
  sort: ReviewSort;
  status: ReviewStatusFilter;
}

export const DEFAULT_INDIVIDUAL_QUERY: IndividualQuery = {
  page: 1,
  pageSize: REVIEW_PAGE_SIZES[0],
  sort: 'status',
  status: 'all',
};

export interface ResponsesQuery {
  /** The question the Question view shows, when one was chosen. */
  fieldId: string | null;
  individual: IndividualQuery;
  /** A choice option to highlight in the Question view. */
  option: string | null;
  view: ResponseView;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<Value extends string>(
  values: readonly Value[],
  value: string | undefined,
  fallback: Value,
): Value {
  return values.find((candidate) => candidate === value) ?? fallback;
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= MAX_REVIEW_PAGE ? page : 1;
}

function parsePageSize(value: string | undefined): ReviewPageSize {
  return (
    REVIEW_PAGE_SIZES.find((size) => String(size) === value) ?? DEFAULT_INDIVIDUAL_QUERY.pageSize
  );
}

/** The Individual index's filter and order, as the Student page also reads them. */
export function parseIndividualQuery(params: SearchParams): IndividualQuery {
  return {
    page: parsePage(single(params.page)),
    pageSize: parsePageSize(single(params.pageSize)),
    sort: oneOf(REVIEW_SORTS, single(params.sort), DEFAULT_INDIVIDUAL_QUERY.sort),
    status: oneOf(REVIEW_STATUS_FILTERS, single(params.status), DEFAULT_INDIVIDUAL_QUERY.status),
  };
}

/**
 * Reads the responses area's state from the URL.
 *
 * Anything unknown falls back to the default rather than failing: a link that
 * was edited by hand still opens the page. There is deliberately no search
 * term here -- it can carry a Student ID, which never goes in a URL (ADR 0020).
 */
export function parseResponsesQuery(params: SearchParams): ResponsesQuery {
  const fieldId = single(params.field);
  const option = single(params.option);
  return {
    fieldId: fieldId !== undefined && FIELD_ID_PATTERN.test(fieldId) ? fieldId : null,
    individual: parseIndividualQuery(params),
    option:
      option !== undefined && option.length > 0 && option.length <= MAX_OPTION_LENGTH
        ? option
        : null,
    view: oneOf(RESPONSE_VIEWS, single(params.view), 'individual'),
  };
}

/** The query string for an Individual filter and order, leaving defaults out. */
export function individualSearch(query: {
  [Key in keyof IndividualQuery]?: IndividualQuery[Key] | undefined;
}): string {
  const params = new URLSearchParams();
  if (query.status !== undefined && query.status !== DEFAULT_INDIVIDUAL_QUERY.status) {
    params.set('status', query.status);
  }
  if (query.sort !== undefined && query.sort !== DEFAULT_INDIVIDUAL_QUERY.sort) {
    params.set('sort', query.sort);
  }
  if (query.page !== undefined && query.page !== DEFAULT_INDIVIDUAL_QUERY.page) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined && query.pageSize !== DEFAULT_INDIVIDUAL_QUERY.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

export function submissionsHref(
  groupId: string,
  formId: string,
  state: { fieldId?: string | undefined; option?: string | undefined; view: ResponseView } & {
    [Key in keyof IndividualQuery]?: IndividualQuery[Key] | undefined;
  },
): string {
  const base = `/groups/${groupId}/forms/${formId}/submissions`;
  if (state.view === 'individual') return `${base}${individualSearch(state)}`;
  const params = new URLSearchParams({ view: state.view });
  if (state.fieldId !== undefined) params.set('field', state.fieldId);
  if (state.option !== undefined) params.set('option', state.option);
  return `${base}?${params.toString()}`;
}

/**
 * One Student's page, carrying the filter and order that previous and next
 * follow, and the page size that says which table page they are on.
 */
export function studentHref(
  groupId: string,
  formId: string,
  studentAccountId: string,
  query: {
    pageSize?: IndividualQuery['pageSize'] | undefined;
    sort?: IndividualQuery['sort'] | undefined;
    status?: IndividualQuery['status'] | undefined;
    version?: number | undefined;
  },
): string {
  const search = individualSearch({
    pageSize: query.pageSize,
    sort: query.sort,
    status: query.status,
  });
  const params = new URLSearchParams(search);
  if (query.version !== undefined) params.set('version', String(query.version));
  const text = params.toString();
  return `/groups/${groupId}/forms/${formId}/students/${studentAccountId}${text === '' ? '' : `?${text}`}`;
}
