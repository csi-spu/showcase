export type RosterConflictActionError = 'invalid' | 'reasonRequired' | 'stale' | 'unavailable';

export interface RosterConflictActionState {
  error: RosterConflictActionError | null;
}

export type RosterConflictAction = (
  state: RosterConflictActionState,
  formData: FormData,
) => Promise<RosterConflictActionState>;

export const INITIAL_ROSTER_CONFLICT_STATE: RosterConflictActionState = { error: null };
