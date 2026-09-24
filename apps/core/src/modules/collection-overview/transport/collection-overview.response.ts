import type {
  CollectionOverviewActiveRoundTotals,
  CollectionStudentAttentionStatus,
} from '../application/collection-overview.ports';

/**
 * The wire shape of every Instructor dashboard read.
 *
 * Timestamps are UTC ISO-8601 strings, not Date objects, so the contract does
 * not depend on the serializer. The frontend validates these with strict
 * schemas that reject unknown keys, so adding a field here is a contract
 * change.
 */
export interface CollectionOverviewAttentionResponseItem {
  deadlineAt: string | null;
  formId: string;
  formTitle: string;
  groupId: string;
  groupName: string;
  roundId: string;
  roundName: string;
  studentsNotSubmitted: number;
  submissionsPendingReview: number;
}

/** `deadlineAt` is never null: a form without a deadline is not upcoming. */
export interface CollectionOverviewUpcomingResponseItem {
  deadlineAt: string;
  formId: string;
  formTitle: string;
  groupId: string;
  groupName: string;
  roundId: string;
  roundName: string;
  studentsNotSubmitted: number;
}

export interface CollectionOverviewProgressResponseItem {
  completedStudents: number;
  deadlineAt: string | null;
  formId: string;
  formTitle: string;
  groupId: string;
  groupName: string;
  roundId: string;
  roundName: string;
  totalStudents: number;
}

export interface CollectionOverviewResponse {
  activeFormProgress: CollectionOverviewProgressResponseItem[];
  activeRoundTotals: CollectionOverviewActiveRoundTotals;
  needsAttention: CollectionOverviewAttentionResponseItem[];
  roundCounts: { active: number; closed: number };
  upcomingDeadlines: CollectionOverviewUpcomingResponseItem[];
}

/**
 * One Student's outstanding obligation.
 *
 * There is deliberately no Student ID field. Core retains only a keyed hash of
 * the Student ID (ADR 0013), so the value cannot be produced by any read path.
 */
export interface CollectionStudentAttentionResponseRow {
  deadlineAt: string | null;
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

export interface CollectionStudentAttentionResponse {
  nextCursor: string | null;
  rows: CollectionStudentAttentionResponseRow[];
}

export interface CollectionFilterOptionsResponse {
  entryYears: number[];
  groups: { id: string; name: string; roundId: string }[];
  rounds: { id: string; name: string; status: string }[];
}
