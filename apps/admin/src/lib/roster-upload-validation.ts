const MAX_ROSTER_FILE_BYTES = 5 * 1024 * 1024;

export type RosterUploadValidationError =
  'entryYear' | 'fileRequired' | 'fileTooLarge' | 'fileType';

export interface ValidRosterUpload {
  entryYear: number;
  file: File;
}

export function validateRosterUpload(
  formData: FormData,
): RosterUploadValidationError | ValidRosterUpload {
  const entryYearValue = formData.get('entryYear');
  if (typeof entryYearValue !== 'string' || !/^\d{4}$/.test(entryYearValue)) {
    return 'entryYear';
  }
  const entryYear = Number(entryYearValue);
  if (entryYear < 2400 || entryYear > 2700) return 'entryYear';

  const file = formData.get('rosterFile');
  if (!(file instanceof File) || file.size === 0) return 'fileRequired';
  if (!file.name.toLowerCase().endsWith('.csv')) return 'fileType';
  if (file.size > MAX_ROSTER_FILE_BYTES) return 'fileTooLarge';
  return { entryYear, file };
}
