import type { CollectionReviewEntry } from './collection-forms.ports';

export type CollectionReviewStatus = CollectionReviewEntry['status'];

/*
 * Work waiting on the Instructor comes first, then work waiting on the
 * Student, then what is settled. The default order, so the queue opens on
 * what to do next.
 */
export const REVIEW_STATUS_ORDER = [
  'awaiting_checking',
  'changes_required',
  'not_submitted',
  'passed',
  'withdrawn',
] as const satisfies readonly CollectionReviewStatus[];

export const REVIEW_SORTS = ['status', 'name', 'submittedDesc', 'submittedAsc'] as const;
export type CollectionReviewSort = (typeof REVIEW_SORTS)[number];

export const DEFAULT_REVIEW_PAGE_SIZE = 10;
export const MAX_REVIEW_PAGE_SIZE = 100;
/* Far past any group's size; a page beyond the last is clamped back to it. */
export const MAX_REVIEW_PAGE = 10_000;

const STUDENT_ID_PREFIX_PATTERN = /^[0-9]{1,8}$/u;

/*
 * A search term: a partial Roster name, or a Student ID prefix matched through
 * its keyed hash so Students without a recorded raw value are still found.
 */
export type CollectionReviewSearch =
  | { kind: 'name'; name: string }
  | { kind: 'student_id_prefix'; prefixHash: string; prefixLength: number };

/** Which Students the queue lists and in what order. Search never reaches this from a URL. */
export interface CollectionReviewFilter {
  search: CollectionReviewSearch | null;
  sort: CollectionReviewSort;
  /** Null lists every status. */
  status: CollectionReviewStatus | null;
}

/** A Student as a jump list names them: nothing beyond who they are. */
export interface CollectionReviewStudent {
  rosterName: { firstNameTh: string; lastNameTh: string };
  studentAccountId: string;
}

/** One page of the queue, with counts that let every Student be reached. */
export interface CollectionReviewPage {
  entries: CollectionReviewEntry[];
  /** The page returned, after clamping to the pages that exist. */
  page: number;
  /** Students matching the search, per status; the status filter is not applied. */
  statusCounts: Record<CollectionReviewStatus, number>;
  /** Students matching both the search and the status filter. */
  total: number;
}

/**
 * Where one Student sits in the queue under a status filter and order.
 *
 * A decision can move the Student out of the filter -- passing someone in
 * "awaiting checking" -- and then the neighbours are where the Student would
 * have sorted, so "next" still means the next one to review.
 */
export interface CollectionReviewPosition {
  entry: CollectionReviewEntry;
  next: CollectionReviewStudent | null;
  /** The table page holding the Student, or where they would sort. */
  page: number;
  /** The Students listed on that page, in order. */
  pageStudents: CollectionReviewStudent[];
  /** One-based place among listed Students, or null when the filter excludes this Student. */
  position: number | null;
  previous: CollectionReviewStudent | null;
  total: number;
}

/* One to eight digits search by Student ID prefix; anything else by Roster name. */
export function toReviewSearch(
  term: string | null,
  hashStudentId: (value: string) => string,
): CollectionReviewSearch | null {
  const query = term?.trim().replace(/\s+/gu, ' ') ?? '';
  if (query.length === 0) return null;
  if (!STUDENT_ID_PREFIX_PATTERN.test(query)) return { kind: 'name', name: query };
  return {
    kind: 'student_id_prefix',
    prefixHash: hashStudentId(query),
    prefixLength: query.length,
  };
}

/** A requested page clamped to the pages `total` rows fill; an empty list still has page 1. */
export function clampReviewPage(page: number, pageSize: number, total: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
}
