export type ProfileActionError = 'conflict' | 'invalid' | 'network' | 'photo' | 'unavailable';

export interface ProfileActionState {
  error: ProfileActionError | null;
  success: boolean;
}

export const INITIAL_PROFILE_ACTION_STATE: ProfileActionState = {
  error: null,
  success: false,
};
