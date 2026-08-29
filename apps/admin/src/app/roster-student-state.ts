export type RosterStudentErrorMessage = 'invalid' | 'unavailable';

export interface RosterStudentActionState {
  error: RosterStudentErrorMessage | null;
}

export type RosterStudentAction = (
  state: RosterStudentActionState,
  formData: FormData,
) => Promise<RosterStudentActionState>;

export const INITIAL_ROSTER_STUDENT_STATE: RosterStudentActionState = { error: null };
