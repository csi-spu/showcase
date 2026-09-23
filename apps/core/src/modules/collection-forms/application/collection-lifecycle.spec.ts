import {
  findCloseReasonError,
  hasDeadlinePassed,
  isFirstSubmissionLate,
  summarizePendingWork,
  type PendingWorkCounts,
} from './collection-lifecycle';

const deadline = new Date('2026-09-20T17:00:00.000Z');

describe('hasDeadlinePassed', () => {
  it('has not passed without a deadline', () => {
    expect(hasDeadlinePassed({ deadlineAt: null, now: new Date('2027-01-01') })).toBe(false);
  });

  it('has not passed while the deadline is ahead', () => {
    expect(
      hasDeadlinePassed({ deadlineAt: deadline, now: new Date('2026-09-20T16:59:59.000Z') }),
    ).toBe(false);
  });

  it('has not passed exactly on the deadline', () => {
    expect(hasDeadlinePassed({ deadlineAt: deadline, now: deadline })).toBe(false);
  });

  it('has passed once the deadline is behind', () => {
    expect(
      hasDeadlinePassed({ deadlineAt: deadline, now: new Date('2026-09-20T17:00:01.000Z') }),
    ).toBe(true);
  });

  /*
   * The case the Student dashboard needs and lateness cannot express: nothing
   * has been submitted, so there is no submission to call late, yet the
   * deadline is already gone.
   */
  it('is true while nothing has been submitted, where lateness is still false', () => {
    const now = new Date('2026-09-21T09:00:00.000Z');
    expect(hasDeadlinePassed({ deadlineAt: deadline, now })).toBe(true);
    expect(isFirstSubmissionLate({ deadlineAt: deadline, firstSubmittedAt: null })).toBe(false);
  });
});

describe('isFirstSubmissionLate', () => {
  it('is not late without a deadline', () => {
    expect(
      isFirstSubmissionLate({ deadlineAt: null, firstSubmittedAt: new Date('2027-01-01') }),
    ).toBe(false);
  });

  it('is not late before the submission exists', () => {
    expect(isFirstSubmissionLate({ deadlineAt: deadline, firstSubmittedAt: null })).toBe(false);
  });

  it('is not late when the first submission arrived on the deadline', () => {
    expect(isFirstSubmissionLate({ deadlineAt: deadline, firstSubmittedAt: deadline })).toBe(false);
  });

  it('is late when the first submission arrived after the deadline', () => {
    expect(
      isFirstSubmissionLate({
        deadlineAt: deadline,
        firstSubmittedAt: new Date('2026-09-20T17:00:01.000Z'),
      }),
    ).toBe(true);
  });

  /*
   * The point of AC12: extending a deadline past an already-late first submission
   * makes it on time again, and it is recalculated from the retained original
   * timestamp rather than stamped once at submit.
   */
  it('recalculates against an extended deadline', () => {
    const firstSubmittedAt = new Date('2026-09-21T09:00:00.000Z');
    expect(isFirstSubmissionLate({ deadlineAt: deadline, firstSubmittedAt })).toBe(true);
    expect(
      isFirstSubmissionLate({
        deadlineAt: new Date('2026-09-30T17:00:00.000Z'),
        firstSubmittedAt,
      }),
    ).toBe(false);
  });

  /* A correction arriving later never makes an on-time first submission late. */
  it('ignores later corrections', () => {
    expect(
      isFirstSubmissionLate({
        deadlineAt: deadline,
        firstSubmittedAt: new Date('2026-09-19T08:00:00.000Z'),
      }),
    ).toBe(false);
  });
});

describe('findCloseReasonError', () => {
  it('rejects an empty reason', () => {
    expect(findCloseReasonError('')).toBe('REASON_REQUIRED');
    expect(findCloseReasonError('   ')).toBe('REASON_REQUIRED');
  });

  it('rejects a reason beyond the stored length', () => {
    expect(findCloseReasonError('a'.repeat(2_001))).toBe('REASON_TOO_LONG');
  });

  it('accepts an actionable reason', () => {
    expect(findCloseReasonError('  รอบเก็บเอกสารสิ้นสุดแล้ว  ')).toBeNull();
  });
});

describe('summarizePendingWork', () => {
  const counts: PendingWorkCounts = {
    awaitingChecking: 3,
    changesRequired: 2,
    notSubmitted: 5,
  };

  it('totals every unfinished obligation', () => {
    expect(summarizePendingWork(counts)).toEqual({ ...counts, total: 10 });
  });

  /*
   * Closure is allowed with pending work; the Instructor only has to see it
   * first. A zero total is what "nothing outstanding" looks like, not a
   * precondition.
   */
  it('reports nothing outstanding as zero', () => {
    expect(
      summarizePendingWork({ awaitingChecking: 0, changesRequired: 0, notSubmitted: 0 }),
    ).toEqual({ awaitingChecking: 0, changesRequired: 0, notSubmitted: 0, total: 0 });
  });
});
