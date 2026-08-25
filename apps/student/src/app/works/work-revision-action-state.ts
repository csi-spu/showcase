export type WorkRevisionActionError =
  | 'attribution'
  | 'conflict'
  | 'incomplete'
  | 'invalid'
  | 'media'
  | 'network'
  | 'poster'
  | 'unavailable';

export interface WorkRevisionActionState {
  error: WorkRevisionActionError | null;
  idempotencyKey: string;
  success: boolean;
}

export function initialWorkRevisionActionState(idempotencyKey: string): WorkRevisionActionState {
  return { error: null, idempotencyKey, success: false };
}
