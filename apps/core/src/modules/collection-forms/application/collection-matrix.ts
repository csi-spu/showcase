/*
 * The Student-by-form matrix an Instructor tracks a group with.
 *
 * The matrix vocabulary is wider than the stored obligation status, and the two
 * extra states are exactly the ones that are easy to confuse:
 *
 * - `not_required` is the absence of an obligation. A Student who was never
 *   assigned a form has not failed to submit it, and counting the two together
 *   is the reporting error this whole view exists to prevent.
 * - `late` is derived against the form's *current* deadline, never stored, so
 *   extending a deadline recalculates it -- the same rule the Student and
 *   review surfaces already apply.
 *
 * Summaries are computed here rather than in SQL so that one definition of each
 * state serves the cells and the totals. A cell and a total that disagree is a
 * dashboard nobody can act on.
 */

import { isFirstSubmissionLate } from './collection-lifecycle';

/** Rows per matrix page. Bounded: a group may hold far more members than this. */
export const MAX_MATRIX_ROWS = 100;

/** Forms per matrix page. Every row carries a cell for each, so this bounds width too. */
export const MAX_MATRIX_FORMS = 30;

/**
 * What one Student owes on one form.
 *
 * `not_required` carries no submission, by construction: there is no obligation
 * to have submitted against.
 */
export type CollectionMatrixCellStatus =
  | 'awaiting_checking'
  | 'changes_required'
  | 'not_required'
  | 'not_submitted'
  | 'passed'
  | 'withdrawn';

export interface CollectionMatrixCell {
  formId: string;
  /**
   * Whether the first submission missed the form's current deadline.
   *
   * Orthogonal to `status`: a passed submission can still have arrived late,
   * and that is precisely what an Instructor reviewing timeliness needs to see.
   */
  isLate: boolean;
  status: CollectionMatrixCellStatus;
}

export interface CollectionMatrixRow {
  cells: CollectionMatrixCell[];
  /** Withdrawn members stay on the matrix; their obligations no longer count. */
  isWithdrawn: boolean;
  /** Read-only identity from the Student Roster. Never a Student ID. */
  rosterName: { firstNameTh: string; lastNameTh: string };
  studentAccountId: string;
}

/**
 * Totals across the matrix.
 *
 * `notRequired` is reported separately from `notSubmitted` for the same reason
 * the cell states are distinct, and `late` counts submissions rather than
 * cells, so it overlaps the status counts instead of partitioning them.
 */
export interface CollectionMatrixSummary {
  awaitingChecking: number;
  changesRequired: number;
  late: number;
  notRequired: number;
  notSubmitted: number;
  passed: number;
  withdrawn: number;
}

/** One obligation as the matrix query returns it, before the derived states. */
export interface MatrixObligationInput {
  deadlineAt: Date | null;
  firstSubmittedAt: Date | null;
  formId: string;
  status: Exclude<CollectionMatrixCellStatus, 'not_required'>;
  studentAccountId: string;
}

export interface MatrixMemberInput {
  isWithdrawn: boolean;
  rosterName: { firstNameTh: string; lastNameTh: string };
  studentAccountId: string;
}

/**
 * Builds one row per member, one cell per form, in the order given.
 *
 * Every member gets a cell for every form on the page: a missing obligation
 * becomes `not_required` rather than disappearing, so the grid stays
 * rectangular and a gap is never mistaken for a missing submission.
 */
export function buildMatrixRows(input: {
  formIds: string[];
  members: MatrixMemberInput[];
  obligations: MatrixObligationInput[];
}): CollectionMatrixRow[] {
  const byStudent = new Map<string, Map<string, MatrixObligationInput>>();
  for (const obligation of input.obligations) {
    const forStudent =
      byStudent.get(obligation.studentAccountId) ?? new Map<string, MatrixObligationInput>();
    forStudent.set(obligation.formId, obligation);
    byStudent.set(obligation.studentAccountId, forStudent);
  }

  return input.members.map((member) => {
    const forStudent = byStudent.get(member.studentAccountId);
    return {
      cells: input.formIds.map((formId) => {
        const obligation = forStudent?.get(formId);
        if (obligation === undefined) {
          return { formId, isLate: false, status: 'not_required' as const };
        }
        return {
          formId,
          isLate: isFirstSubmissionLate({
            deadlineAt: obligation.deadlineAt,
            firstSubmittedAt: obligation.firstSubmittedAt,
          }),
          status: obligation.status,
        };
      }),
      isWithdrawn: member.isWithdrawn,
      rosterName: member.rosterName,
      studentAccountId: member.studentAccountId,
    };
  });
}

/**
 * Counts the cells on the page.
 *
 * Deliberately a page summary, not a group one: it describes the rows in hand.
 * Group-wide outstanding work is `getRoundPendingWork`, which counts in the
 * database precisely because it must not depend on what fits on a page.
 */
export function summarizeMatrix(rows: CollectionMatrixRow[]): CollectionMatrixSummary {
  const summary: CollectionMatrixSummary = {
    awaitingChecking: 0,
    changesRequired: 0,
    late: 0,
    notRequired: 0,
    notSubmitted: 0,
    passed: 0,
    withdrawn: 0,
  };
  for (const row of rows) {
    for (const cell of row.cells) {
      /* Counted alongside the status, not instead of it: lateness is not a state. */
      if (cell.isLate) summary.late += 1;
      switch (cell.status) {
        case 'awaiting_checking':
          summary.awaitingChecking += 1;
          break;
        case 'changes_required':
          summary.changesRequired += 1;
          break;
        case 'not_required':
          summary.notRequired += 1;
          break;
        case 'not_submitted':
          summary.notSubmitted += 1;
          break;
        case 'passed':
          summary.passed += 1;
          break;
        case 'withdrawn':
          summary.withdrawn += 1;
          break;
      }
    }
  }
  return summary;
}

/** Clamps a requested page size to the bound, rejecting nothing silently useful. */
export function boundMatrixLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isInteger(requested) || requested < 1) {
    return MAX_MATRIX_ROWS;
  }
  return Math.min(requested, MAX_MATRIX_ROWS);
}
