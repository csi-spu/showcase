export type RecoveryActionError = 'conflict' | 'invalid' | 'network' | 'unavailable';

export interface RecoveryActionState {
  error: RecoveryActionError | null;
  idempotencyKey: string;
  success: boolean;
}

export function initialRecoveryActionState(idempotencyKey: string): RecoveryActionState {
  return { error: null, idempotencyKey, success: false };
}
