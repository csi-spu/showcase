import { evaluateStudentAccess } from '../../auth/domain/student-access-policy';

/** One create or add request, and one "select all matching" snapshot, stays within this bound. */
export const MAX_MEMBERS_PER_REQUEST = 2_000;
/** CSV Student IDs are resolved in chunks of at most this many. */
export const MAX_STUDENT_IDS_PER_RESOLVE = 500;

export type SelectionStatus = 'current_member' | 'no_access' | 'selectable' | 'withdrawn_member';

export interface SelectionCandidate {
  accessEndsAcademicYear: number;
  currentAcademicYear: number | null;
  entryYear: number;
  /** Membership in the target group; always null when creating a new group. */
  membershipStatus: 'current' | 'withdrawn' | null;
}

/*
 * An eligible Student holds an active Student Account (enforced by the query)
 * and is within the effective Student Access Period, Admin extensions
 * included. A withdrawn member returns only through reinstatement, so they are
 * never selectable here even when eligible.
 */
export function evaluateSelectionStatus(candidate: SelectionCandidate): SelectionStatus {
  if (candidate.membershipStatus === 'current') return 'current_member';
  if (candidate.membershipStatus === 'withdrawn') return 'withdrawn_member';
  const access = evaluateStudentAccess(candidate);
  return access.canUseStudentCapabilities ? 'selectable' : 'no_access';
}
