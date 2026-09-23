/*
 * Deadline timeliness and closure policy.
 *
 * Two rules from the specification live here because both are easy to get
 * subtly wrong in SQL and both are asked about from more than one place:
 *
 * - Lateness is a property of the *first* submission measured against the
 *   *current* deadline. It is derived on read, never stamped at submit, so
 *   extending a deadline recalculates it while the original submission
 *   timestamp is retained untouched.
 * - Closing a round or a form's first submissions is an audited act that
 *   requires a reason the next person can act on.
 */

/** Matches the `reason` columns on the collection audit tables. */
const MAX_REASON_LENGTH = 2_000;

/**
 * Whether the Student's first submission missed the deadline.
 *
 * Deliberately excludes correction and checking times: a first submission that
 * was on time stays on time no matter how long the corrections take afterwards.
 * A submission exactly on the deadline is on time.
 */
export function isFirstSubmissionLate(input: {
  deadlineAt: Date | null;
  firstSubmittedAt: Date | null;
}): boolean {
  if (input.deadlineAt === null || input.firstSubmittedAt === null) return false;
  return input.firstSubmittedAt.getTime() > input.deadlineAt.getTime();
}

/**
 * Whether the deadline has already passed.
 *
 * Separate from `isFirstSubmissionLate`, which answers a question about a
 * submission that exists. This one warns a Student who has not submitted yet,
 * so it is the only one that can be true while nothing has been sent.
 */
export function hasDeadlinePassed(input: { deadlineAt: Date | null; now: Date }): boolean {
  if (input.deadlineAt === null) return false;
  return input.now.getTime() > input.deadlineAt.getTime();
}

export function findCloseReasonError(reason: string): 'REASON_REQUIRED' | 'REASON_TOO_LONG' | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return 'REASON_REQUIRED';
  if (trimmed.length > MAX_REASON_LENGTH) return 'REASON_TOO_LONG';
  return null;
}

/** Unfinished obligations an Instructor must see before closing a round. */
export interface PendingWorkCounts {
  awaitingChecking: number;
  changesRequired: number;
  notSubmitted: number;
}

/**
 * Adds the total the confirmation dialog shows.
 *
 * Pending work does not block closure -- the Instructor decides -- so this
 * reports rather than gates. Withdrawn members are excluded upstream, in the
 * query, because they no longer owe anything.
 */
export function summarizePendingWork(
  counts: PendingWorkCounts,
): PendingWorkCounts & { total: number } {
  return {
    ...counts,
    total: counts.awaitingChecking + counts.changesRequired + counts.notSubmitted,
  };
}
