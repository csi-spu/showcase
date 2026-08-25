export type RosterUploadErrorMessage =
  | 'entryYear'
  | 'fileInvalid'
  | 'fileRequired'
  | 'fileTooLarge'
  | 'fileType'
  | 'sessionExpired'
  | 'unavailable';

export interface RosterUploadActionState {
  error: RosterUploadErrorMessage | null;
}

export type RosterUploadAction = (
  state: RosterUploadActionState,
  formData: FormData,
) => Promise<RosterUploadActionState>;

export const INITIAL_ROSTER_UPLOAD_STATE: RosterUploadActionState = { error: null };
