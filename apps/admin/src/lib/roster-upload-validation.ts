const MAX_ROSTER_FILE_BYTES = 5 * 1024 * 1024;

export type RosterUploadValidationError = 'fileRequired' | 'fileTooLarge' | 'fileType';

export interface ValidRosterUpload {
  file: File;
}

export function validateRosterUpload(
  formData: FormData,
): RosterUploadValidationError | ValidRosterUpload {
  const file = formData.get('rosterFile');
  if (!(file instanceof File) || file.size === 0) return 'fileRequired';
  if (!file.name.toLowerCase().endsWith('.csv')) return 'fileType';
  if (file.size > MAX_ROSTER_FILE_BYTES) return 'fileTooLarge';
  return { file };
}
