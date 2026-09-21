export type AuthErrorMessage =
  | 'credentials'
  | 'network'
  | 'passwordMismatch'
  | 'passwordPolicy'
  | 'rateLimited'
  | 'sessionExpired'
  | 'unavailable';

export interface AuthActionState {
  error: AuthErrorMessage | null;
}

export type AuthAction = (
  previousState: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

export const INITIAL_AUTH_ACTION_STATE: AuthActionState = { error: null };
