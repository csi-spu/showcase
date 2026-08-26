export type WorkRemovalActionError = 'conflict' | 'invalid' | 'network' | 'unavailable';

export interface WorkRemovalActionState {
  error: WorkRemovalActionError | null;
  idempotencyKey: string;
  success: boolean;
}

export function initialWorkRemovalActionState(idempotencyKey: string): WorkRemovalActionState {
  return { error: null, idempotencyKey, success: false };
}
