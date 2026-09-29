import type { InstructorSubmissionHistory } from '@/lib/instructor-collection-forms-contract';

export type DecisionAvailability =
  'available' | 'decided' | 'olderVersion' | 'roundClosed' | 'withdrawn';

/**
 * Whether the shown version can be decided, and if not, why.
 *
 * Only the latest version is decided, only while it awaits checking, only while
 * the round is open, and never for a Student who left the group. The reasons
 * are checked in that order so the one stated is the one that would still hold
 * after the others changed.
 */
export function decisionAvailability({
  isLatest,
  isRoundClosed,
  status,
}: {
  isLatest: boolean;
  isRoundClosed: boolean;
  status: InstructorSubmissionHistory['status'];
}): DecisionAvailability {
  if (status === 'withdrawn') return 'withdrawn';
  if (isRoundClosed) return 'roundClosed';
  if (!isLatest) return 'olderVersion';
  /* Core decides only a version awaiting checking; any other would be stale. */
  if (status !== 'awaiting_checking') return 'decided';
  return 'available';
}
