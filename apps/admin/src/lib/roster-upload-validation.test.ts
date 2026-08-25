import { describe, expect, it } from 'vitest';
import { validateRosterUpload } from './roster-upload-validation';

describe('validateRosterUpload', () => {
  it('accepts one CSV file without a manually selected Entry Year', () => {
    const formData = new FormData();
    const file = new File(
      ['student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี'],
      'roster.csv',
      { type: 'text/csv' },
    );
    formData.set('rosterFile', file);

    expect(validateRosterUpload(formData)).toEqual({ file });
  });

  it.each([
    ['wrong extension', new File(['safe'], 'roster.txt'), 'fileType'],
    ['empty CSV', new File([], 'roster.csv'), 'fileRequired'],
    [
      'oversized CSV',
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'roster.csv'),
      'fileTooLarge',
    ],
  ])('rejects %s at the Server Action boundary', (_case, file, error) => {
    const formData = new FormData();
    formData.set('rosterFile', file);
    expect(validateRosterUpload(formData)).toBe(error);
  });
});
