import type { CollectionField } from './collection-field';
import {
  findSubmissionFileError,
  findUploadRequestError,
  sanitizeDownloadFilename,
  type CollectionFile,
} from './collection-files';

const STUDENT = 'student-1';
const FORM = 'form-1';

const uploadField: CollectionField = {
  description: '',
  file: { allowedFileTypes: ['pdf', 'jpeg'], maxFiles: 2 },
  id: 'doc',
  label: 'เอกสาร',
  required: false,
  type: 'file_upload',
};

function file(overrides: Partial<CollectionFile> = {}): CollectionFile {
  return {
    byteSize: 1_000,
    createdAt: new Date('2026-09-22T10:00:00.000Z'),
    declaredContentType: 'application/pdf',
    detectedContentType: 'application/pdf',
    fieldId: 'doc',
    formId: FORM,
    id: 'file-1',
    inspectionErrorCode: null,
    originalFilename: 'report.pdf',
    status: 'ready',
    studentAccountId: STUDENT,
    ...overrides,
  };
}

describe('findUploadRequestError', () => {
  const request = {
    byteSize: 1_000,
    declaredContentType: 'application/pdf',
    filename: 'report.pdf',
  };

  it('accepts an allowed type within the limits', () => {
    expect(findUploadRequestError(uploadField, request, 0)).toBeNull();
  });

  it('rejects a file over the decimal per-file limit', () => {
    expect(findUploadRequestError(uploadField, { ...request, byteSize: 10_000_001 }, 0)).toBe(
      'FILE_TOO_LARGE',
    );
    expect(findUploadRequestError(uploadField, { ...request, byteSize: 10_000_000 }, 0)).toBeNull();
  });

  it('rejects a type the Instructor did not allow for this field', () => {
    expect(
      findUploadRequestError(
        uploadField,
        { ...request, declaredContentType: 'image/png', filename: 'a.png' },
        0,
      ),
    ).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('rejects a type outside the platform list entirely', () => {
    expect(
      findUploadRequestError(
        uploadField,
        { ...request, declaredContentType: 'application/zip', filename: 'a.zip' },
        0,
      ),
    ).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('rejects an extension that disagrees with the declared type', () => {
    expect(findUploadRequestError(uploadField, { ...request, filename: 'report.exe' }, 0)).toBe(
      'FILE_TYPE_NOT_ALLOWED',
    );
  });

  it('enforces the per-field file count', () => {
    expect(findUploadRequestError(uploadField, request, 2)).toBe('FILE_COUNT_EXCEEDED');
  });
});

describe('sanitizeDownloadFilename', () => {
  it('removes directory components so a name cannot traverse', () => {
    expect(sanitizeDownloadFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeDownloadFilename('a\\b\\c.pdf')).toBe('c.pdf');
  });

  it('strips quotes and control characters that would break a header', () => {
    expect(sanitizeDownloadFilename('re"port\r\n.pdf')).toBe('report.pdf');
  });

  it('falls back to a safe name when nothing usable remains', () => {
    expect(sanitizeDownloadFilename('...')).toBe('document');
  });
});

describe('findSubmissionFileError', () => {
  const actor = { formId: FORM, studentAccountId: STUDENT };

  it('accepts ready files that belong to this Student, form, and field', () => {
    expect(findSubmissionFileError([{ field: uploadField, files: [file()] }], actor)).toBeNull();
  });

  it('refuses a file that has not completed inspection', () => {
    for (const status of ['quarantined', 'inspecting', 'failed'] as const) {
      expect(
        findSubmissionFileError([{ field: uploadField, files: [file({ status })] }], actor),
      ).toEqual({ code: 'FILE_NOT_READY', fieldId: 'doc' });
    }
  });

  it('refuses a file belonging to another Student', () => {
    expect(
      findSubmissionFileError(
        [{ field: uploadField, files: [file({ studentAccountId: 'student-2' })] }],
        actor,
      ),
    ).toEqual({ code: 'FILE_NOT_ACCESSIBLE', fieldId: 'doc' });
  });

  it('refuses a file uploaded for a different form or field', () => {
    expect(
      findSubmissionFileError([{ field: uploadField, files: [file({ formId: 'other' })] }], actor),
    ).toEqual({ code: 'FILE_NOT_ACCESSIBLE', fieldId: 'doc' });
    expect(
      findSubmissionFileError([{ field: uploadField, files: [file({ fieldId: 'other' })] }], actor),
    ).toEqual({ code: 'FILE_NOT_ACCESSIBLE', fieldId: 'doc' });
  });

  it('trusts the detected type over the declared one', () => {
    expect(
      findSubmissionFileError(
        [
          {
            field: uploadField,
            files: [
              file({
                declaredContentType: 'application/pdf',
                detectedContentType: 'application/zip',
              }),
            ],
          },
        ],
        actor,
      ),
    ).toEqual({ code: 'FILE_TYPE_NOT_ALLOWED', fieldId: 'doc' });
  });

  it('requires at least one file for a required upload field', () => {
    expect(
      findSubmissionFileError([{ field: { ...uploadField, required: true }, files: [] }], actor),
    ).toEqual({ code: 'FILE_REQUIRED', fieldId: 'doc' });
  });

  it('enforces the decimal total across every upload field', () => {
    const selections = [
      {
        field: uploadField,
        files: [file({ byteSize: 9_000_000, id: 'a' }), file({ byteSize: 9_000_000, id: 'b' })],
      },
      {
        field: { ...uploadField, id: 'doc2' },
        files: [
          file({ byteSize: 9_000_000, fieldId: 'doc2', id: 'c' }),
          file({ byteSize: 9_000_000, fieldId: 'doc2', id: 'd' }),
        ],
      },
      {
        field: { ...uploadField, id: 'doc3' },
        files: [
          file({ byteSize: 9_000_000, fieldId: 'doc3', id: 'e' }),
          file({ byteSize: 9_000_000, fieldId: 'doc3', id: 'f' }),
        ],
      },
    ];
    expect(findSubmissionFileError(selections, actor)).toEqual({
      code: 'SUBMISSION_TOO_LARGE',
      fieldId: null,
    });
  });

  it('enforces the per-field count again at submission', () => {
    expect(
      findSubmissionFileError(
        [
          {
            field: uploadField,
            files: [file({ id: 'a' }), file({ id: 'b' }), file({ id: 'c' })],
          },
        ],
        actor,
      ),
    ).toEqual({ code: 'FILE_COUNT_EXCEEDED', fieldId: 'doc' });
  });
});
