import { describe, expect, it } from 'vitest';
import { validateRosterUpload } from './roster-upload-validation';

describe('validateRosterUpload', () => {
  it('accepts one CSV file and a Buddhist Entry Year', () => {
    const formData = new FormData();
    const file = new File(
      ['student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี'],
      'roster.csv',
      { type: 'text/csv' },
    );
    formData.set('entryYear', '2569');
    formData.set('rosterFile', file);

    expect(validateRosterUpload(formData)).toEqual({ entryYear: 2569, file });
  });

  it.each([
    ['missing Entry Year', '', new File(['safe'], 'roster.csv'), 'entryYear'],
    ['wrong extension', '2569', new File(['safe'], 'roster.txt'), 'fileType'],
    ['empty CSV', '2569', new File([], 'roster.csv'), 'fileRequired'],
    [
      'oversized CSV',
      '2569',
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'roster.csv'),
      'fileTooLarge',
    ],
  ])('rejects %s at the Server Action boundary', (_case, entryYear, file, error) => {
    const formData = new FormData();
    formData.set('entryYear', entryYear);
    formData.set('rosterFile', file);
    expect(validateRosterUpload(formData)).toBe(error);
  });
});
