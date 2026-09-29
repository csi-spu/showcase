import type {
  InstructorReviewEntry,
  InstructorReviewOrder,
  InstructorReviewQueuePage,
  InstructorReviewSort,
} from '@/lib/instructor-collection-forms-contract';

export type ReviewStatus = InstructorReviewEntry['status'];
export type ReviewStatusFilter = 'all' | ReviewStatus;
export type ReviewSort = InstructorReviewSort;

export const REVIEW_PAGE_SIZES = [10, 25, 50] as const;
export type ReviewPageSize = (typeof REVIEW_PAGE_SIZES)[number];

/*
 * Work waiting on the Instructor comes first, then work waiting on the
 * Student, then what is settled. Core orders the queue the same way by
 * default, so it opens on what to do next.
 */
export const REVIEW_STATUS_ORDER: readonly ReviewStatus[] = [
  'awaiting_checking',
  'changes_required',
  'not_submitted',
  'passed',
  'withdrawn',
];

/** The order a status filter and sort ask Core for; "all" is no status filter. */
export function toReviewOrder(query: {
  pageSize: ReviewPageSize;
  sort: ReviewSort;
  status: ReviewStatusFilter;
}): InstructorReviewOrder {
  return {
    pageSize: query.pageSize,
    sort: query.sort,
    status: query.status === 'all' ? null : query.status,
  };
}

/** Core's per-status counts, with "all" as their sum, for the status tabs. */
export function toStatusTabCounts(
  counts: InstructorReviewQueuePage['statusCounts'],
): Record<ReviewStatusFilter, number> {
  const all = REVIEW_STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
  return { ...counts, all };
}

/** How many pages `total` Students fill; an empty list still has one. */
export function reviewPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
