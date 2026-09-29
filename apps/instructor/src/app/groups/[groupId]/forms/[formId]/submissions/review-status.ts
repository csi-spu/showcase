import type { StatusTone } from '@/components/ui/status-badge';
import type { InstructorReviewEntry } from '@/lib/instructor-collection-forms-contract';

/* Tone carries meaning, never colour alone: every badge also states its status. */
export const STATUS_TONES: Record<InstructorReviewEntry['status'], StatusTone> = {
  awaiting_checking: 'information',
  changes_required: 'warning',
  not_submitted: 'muted',
  passed: 'success',
  withdrawn: 'muted',
};
