import type { WorkField } from '@/lib/student-work-validation';

export type WorkActionError = 'conflict' | 'invalid' | 'network' | 'unavailable';

export interface WorkActionState {
  error: WorkActionError | null;
  fieldErrors: WorkField[];
  idempotencyKey: string;
  success: boolean;
  version: number | null;
}

export function initialWorkActionState(
  idempotencyKey: string,
  version: number | null,
): WorkActionState {
  return { error: null, fieldErrors: [], idempotencyKey, success: false, version };
}
