export const COLLECTION_OVERVIEW_REPOSITORY = Symbol('COLLECTION_OVERVIEW_REPOSITORY');

export type CollectionOverviewErrorCode = 'INVALID_CURSOR';

export class CollectionOverviewError extends Error {
  constructor(
    readonly code: CollectionOverviewErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'CollectionOverviewError';
  }
}

/**
 * The scope every Instructor dashboard read shares.
 *
 * Absent fields mean "every active round", which is the landing-page default.
 * `entryYear` filters the Students counted, not the forms listed: a form stays
 * in the result with a smaller obligation count when a cohort is selected, so
 * the dashboard's dropdowns compose instead of emptying each other out.
 */
export interface CollectionOverviewScope {
  entryYear: number | null;
  groupId: string | null;
  roundId: string | null;
}

export interface CollectionOverviewAttentionItem {
  deadlineAt: Date | null;
  formId: string;
  formTitle: string;
  groupId: string;
  groupName: string;
  roundId: string;
  roundName: string;
  studentsNotSubmitted: number;
  submissionsPendingReview: number;
}

/**
 * A form whose deadline is still ahead, for the "closing soon" rail.
 *
 * `deadlineAt` is never null here: a form without a deadline cannot be near
 * one, so it is excluded by the query rather than sorted last.
 */
export interface CollectionOverviewUpcomingDeadline {
  deadlineAt: Date;
  formId: string;
  formTitle: string;
  groupId: string;
  groupName: string;
  roundId: string;
  roundName: string;
  studentsNotSubmitted: number;
}

/**
 * Progress for one open form, as a completed-of-total pair.
 *
 * `totalStudents` counts obligations held by current members, so it matches the
 * denominator the Instructor sees in the group, and `completedStudents` counts
 * the `passed` subset of exactly that set. `completedStudents` is therefore
 * always between zero and `totalStudents`.
 */
export interface CollectionOverviewFormProgress {
  completedStudents: number;
  deadlineAt: Date | null;
  formId: string;
  formTitle: string;
  groupId: string;
  groupName: string;
  roundId: string;
  roundName: string;
  totalStudents: number;
}

/**
 * Landing-page totals for the selected scope.
 *
 * The three Student buckets partition the `students` who hold at least one
 * obligation, and never overlap:
 *
 * - `studentsFullyComplete`: every obligation is `passed`.
 * - `studentsPartiallyComplete`: at least one obligation is `passed` or has
 *   been submitted, but not every obligation is `passed`.
 * - `studentsWithNoSubmission`: nothing has ever been submitted and nothing is
 *   `passed`.
 *
 * `studentsFullyComplete + studentsPartiallyComplete + studentsWithNoSubmission`
 * equals `studentsWithObligations`, which is at most `students`. The remainder,
 * `students - studentsWithObligations`, is the Students who are current members
 * of an active group that has no open form for them yet; they are deliberately
 * outside the donut because they have nothing to complete. The frontend draws
 * the donut over `studentsWithObligations`, not over `students`.
 */
export interface CollectionOverviewActiveRoundTotals {
  groups: number;
  students: number;
  studentsFullyComplete: number;
  studentsPartiallyComplete: number;
  studentsWithNoSubmission: number;
  studentsWithObligations: number;
  submissionsPendingReview: number;
}

export interface CollectionOverview {
  activeFormProgress: CollectionOverviewFormProgress[];
  activeRoundTotals: CollectionOverviewActiveRoundTotals;
  needsAttention: CollectionOverviewAttentionItem[];
  roundCounts: {
    active: number;
    closed: number;
  };
  upcomingDeadlines: CollectionOverviewUpcomingDeadline[];
}

export interface CollectionOverviewQuery {
  attentionLimit: number;
  progressLimit: number;
  scope: CollectionOverviewScope;
  upcomingLimit: number;
}

/**
 * The outstanding state an Instructor can act on.
 *
 * `passed` and `withdrawn` are absent by construction: the first needs no
 * follow-up and the second is no longer owed.
 */
export type CollectionStudentAttentionStatus =
  'awaiting_checking' | 'changes_required' | 'not_submitted';

/**
 * One Student's outstanding obligation.
 *
 * This row carries Roster names so an Instructor can recognise the Student.
 * It deliberately carries no Student ID: Core retains only a keyed hash of it
 * (ADR 0013), so no read path can produce one. See
 * `docs/adr/0018-identify-students-by-roster-name-in-instructor-follow-up.md`.
 */
export interface CollectionStudentAttentionRow {
  deadlineAt: Date | null;
  firstNameTh: string;
  formId: string;
  formTitle: string;
  groupId: string;
  groupName: string;
  isLate: boolean;
  lastNameTh: string;
  roundId: string;
  roundName: string;
  status: CollectionStudentAttentionStatus;
  studentAccountId: string;
}

/**
 * A cursor page of outstanding obligations.
 *
 * `nextCursor` is the opaque composite key of the last row shown, never a
 * Student ID.
 */
export interface CollectionStudentAttentionPage {
  nextCursor: string | null;
  rows: CollectionStudentAttentionRow[];
}

export interface CollectionStudentAttentionQuery {
  cursor: CollectionStudentAttentionCursor | null;
  limit: number;
  scope: CollectionOverviewScope;
}

/**
 * The decoded position of the last row already shown.
 *
 * The sort is (deadline asc nulls last, form id, student account id), so the
 * cursor carries exactly those three parts and nothing identifying.
 */
export interface CollectionStudentAttentionCursor {
  deadlineAt: Date | null;
  formId: string;
  studentAccountId: string;
}

export interface CollectionFilterRound {
  id: string;
  name: string;
  status: string;
}

export interface CollectionFilterGroup {
  id: string;
  name: string;
  roundId: string;
}

export interface CollectionFilterOptions {
  entryYears: number[];
  groups: CollectionFilterGroup[];
  rounds: CollectionFilterRound[];
}

export interface CollectionOverviewRepository {
  getFilterOptions(limits: {
    groupLimit: number;
    roundLimit: number;
  }): Promise<CollectionFilterOptions>;
  getOverview(query: CollectionOverviewQuery): Promise<CollectionOverview>;
  getStudentAttention(
    query: CollectionStudentAttentionQuery,
  ): Promise<CollectionStudentAttentionPage>;
}
