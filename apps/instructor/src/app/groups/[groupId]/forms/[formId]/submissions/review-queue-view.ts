import type { InstructorReviewEntry } from '@/lib/instructor-collection-forms-contract';
import { clampPage } from '@/lib/pagination';

export type ReviewStatus = InstructorReviewEntry['status'];
export type ReviewStatusFilter = 'all' | ReviewStatus;
export type ReviewSort = 'name' | 'status' | 'submittedAsc' | 'submittedDesc';

export const REVIEW_PAGE_SIZES = [10, 25, 50] as const;
export type ReviewPageSize = (typeof REVIEW_PAGE_SIZES)[number];

/*
 * Work waiting on the Instructor comes first, then work waiting on the
 * Student, then what is settled. This is the default order, so the queue
 * opens on what to do next.
 */
export const REVIEW_STATUS_ORDER: readonly ReviewStatus[] = [
  'awaiting_checking',
  'changes_required',
  'not_submitted',
  'passed',
  'withdrawn',
];

export interface ReviewQueueQuery {
  page: number;
  pageSize: ReviewPageSize;
  search: string;
  sort: ReviewSort;
  status: ReviewStatusFilter;
}

export interface ReviewQueueView {
  /** The page actually shown, after clamping to the pages that exist. */
  page: number;
  pageCount: number;
  rows: InstructorReviewEntry[];
  /** Entries matching the search, per status; the status filter itself is not applied. */
  statusCounts: Record<ReviewStatusFilter, number>;
  /** Entries matching both the search and the status filter. */
  total: number;
}

const COLLATOR = new Intl.Collator('th');

function rosterName(entry: InstructorReviewEntry): string {
  return `${entry.rosterName.firstNameTh} ${entry.rosterName.lastNameTh}`;
}

function normalize(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('th').replace(/\s+/gu, ' ').trim();
}

function submittedTime(entry: InstructorReviewEntry): number | null {
  return entry.latestSubmission === null ? null : Date.parse(entry.latestSubmission.submittedAt);
}

/* Entries with nothing submitted sort last in either date direction. */
function compareSubmitted(
  left: InstructorReviewEntry,
  right: InstructorReviewEntry,
  direction: 1 | -1,
): number {
  const leftTime = submittedTime(left);
  const rightTime = submittedTime(right);
  if (leftTime === null || rightTime === null) {
    return (leftTime === null ? 1 : 0) - (rightTime === null ? 1 : 0);
  }
  return (leftTime - rightTime) * direction;
}

function comparator(
  sort: ReviewSort,
): (left: InstructorReviewEntry, right: InstructorReviewEntry) => number {
  const byName = (left: InstructorReviewEntry, right: InstructorReviewEntry) =>
    COLLATOR.compare(rosterName(left), rosterName(right));

  switch (sort) {
    case 'name':
      return byName;
    case 'status':
      return (left, right) =>
        REVIEW_STATUS_ORDER.indexOf(left.status) - REVIEW_STATUS_ORDER.indexOf(right.status) ||
        byName(left, right);
    case 'submittedAsc':
      return (left, right) => compareSubmitted(left, right, 1) || byName(left, right);
    case 'submittedDesc':
      return (left, right) => compareSubmitted(left, right, -1) || byName(left, right);
  }
}

/**
 * Searches, filters, sorts and pages one form's entries.
 *
 * Core returns a form's entries whole -- one per member of the group, and a
 * group is bounded by the member selection limit -- so this runs over what is
 * already loaded instead of asking Core again for every keystroke.
 */
export function viewReviewQueue(
  entries: readonly InstructorReviewEntry[],
  query: ReviewQueueQuery,
): ReviewQueueView {
  const search = normalize(query.search);
  const matching =
    search === ''
      ? [...entries]
      : entries.filter((entry) => normalize(rosterName(entry)).includes(search));

  const statusCounts: Record<ReviewStatusFilter, number> = {
    all: matching.length,
    awaiting_checking: 0,
    changes_required: 0,
    not_submitted: 0,
    passed: 0,
    withdrawn: 0,
  };
  for (const entry of matching) statusCounts[entry.status] += 1;

  const filtered =
    query.status === 'all' ? matching : matching.filter((entry) => entry.status === query.status);
  filtered.sort(comparator(query.sort));

  const pageCount = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = clampPage(query.page, pageCount);
  const start = (page - 1) * query.pageSize;

  return {
    page,
    pageCount,
    rows: filtered.slice(start, start + query.pageSize),
    statusCounts,
    total: filtered.length,
  };
}

/* Digits alone cannot be a Roster name; it is a Student ID, which is never searchable here. */
export function looksLikeStudentId(search: string): boolean {
  return /^\d{4,}$/u.test(search.trim());
}
