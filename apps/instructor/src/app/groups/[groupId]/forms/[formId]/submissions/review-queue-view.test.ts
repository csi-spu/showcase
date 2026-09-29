import { describe, expect, it } from 'vitest';
import { reviewPageCount, toReviewOrder, toStatusTabCounts } from './review-queue-view';

describe('toReviewOrder', () => {
  it('asks Core for no status filter when every status is shown', () => {
    expect(toReviewOrder({ pageSize: 25, sort: 'name', status: 'all' })).toEqual({
      pageSize: 25,
      sort: 'name',
      status: null,
    });
  });

  it('passes a chosen status through', () => {
    expect(toReviewOrder({ pageSize: 10, sort: 'status', status: 'passed' }).status).toBe('passed');
  });
});

describe('toStatusTabCounts', () => {
  it('adds the "all" tab as the sum of every status', () => {
    expect(
      toStatusTabCounts({
        awaiting_checking: 3,
        changes_required: 1,
        not_submitted: 4,
        passed: 2,
        withdrawn: 1,
      }),
    ).toEqual({
      all: 11,
      awaiting_checking: 3,
      changes_required: 1,
      not_submitted: 4,
      passed: 2,
      withdrawn: 1,
    });
  });
});

describe('reviewPageCount', () => {
  it('counts a partial last page', () => {
    expect(reviewPageCount(21, 10)).toBe(3);
  });

  it('keeps one page for an empty list', () => {
    expect(reviewPageCount(0, 10)).toBe(1);
  });
});
