/*
 * Private collection file contract.
 *
 * Uploaded bytes are untrusted until an inspector has examined those exact bytes.
 * The lifecycle is quarantined -> inspecting -> ready | failed, and only `ready`
 * may be attached to a submission.
 *
 * There is deliberately no path that marks a file ready without a recorded
 * inspection result. While no inspector is deployed, files stay quarantined and
 * submission refuses them with FILE_NOT_READY. That is the intended behavior: an
 * unscanned file must never be accepted as a document, and the product must not
 * imply a file is safe before inspection succeeds.
 */

import {
  COLLECTION_FILE_CONTENT_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_FIELD,
  MAX_SUBMISSION_BYTES,
  type CollectionField,
  type CollectionFileType,
} from './collection-field';

export type CollectionFileStatus = 'quarantined' | 'inspecting' | 'ready' | 'failed';

export interface CollectionFile {
  byteSize: number;
  createdAt: Date;
  declaredContentType: string;
  detectedContentType: string | null;
  fieldId: string;
  formId: string;
  id: string;
  inspectionErrorCode: string | null;
  originalFilename: string;
  status: CollectionFileStatus;
  studentAccountId: string;
}

/** What the Student's browser claims before any bytes are sent. Never trusted. */
export interface UploadRequest {
  byteSize: number;
  declaredContentType: string;
  filename: string;
}

/*
 * Pre-upload checks. These reject obviously invalid requests before bytes move,
 * which is a courtesy to the Student, not a security control: the same limits are
 * enforced again against the streamed bytes and once more at submission.
 */
export function findUploadRequestError(
  field: CollectionField,
  request: UploadRequest,
  existingFileCount: number,
): string | null {
  if (field.type !== 'file_upload' || field.file === undefined) return 'FIELD_NOT_FILE_UPLOAD';

  if (!Number.isInteger(request.byteSize) || request.byteSize <= 0) return 'FILE_SIZE_INVALID';
  if (request.byteSize > MAX_FILE_BYTES) return 'FILE_TOO_LARGE';

  const maxFiles = Math.min(field.file.maxFiles, MAX_FILES_PER_FIELD);
  if (existingFileCount >= maxFiles) return 'FILE_COUNT_EXCEEDED';

  const filename = request.filename.trim();
  if (filename.length === 0 || filename.length > 255) return 'FILE_NAME_INVALID';

  const fileType = fileTypeFromDeclared(request.declaredContentType);
  if (fileType === null || !field.file.allowedFileTypes.includes(fileType)) {
    return 'FILE_TYPE_NOT_ALLOWED';
  }
  /*
   * The extension must agree with the declared type. Neither establishes what the
   * file really is — only inspection does — but a mismatch is a clear reject.
   */
  if (!hasMatchingExtension(filename, fileType)) return 'FILE_TYPE_NOT_ALLOWED';
  return null;
}

function fileTypeFromDeclared(contentType: string): CollectionFileType | null {
  const entry = Object.entries(COLLECTION_FILE_CONTENT_TYPES).find(
    ([, value]) => value === contentType,
  );
  return entry === undefined ? null : (entry[0] as CollectionFileType);
}

const EXTENSIONS: Record<CollectionFileType, string[]> = {
  docx: ['.docx'],
  jpeg: ['.jpg', '.jpeg'],
  pdf: ['.pdf'],
  png: ['.png'],
  xlsx: ['.xlsx'],
};

function hasMatchingExtension(filename: string, fileType: CollectionFileType): boolean {
  const lower = filename.toLowerCase();
  return EXTENSIONS[fileType].some((extension) => lower.endsWith(extension));
}

/**
 * Strips directory components and control characters from a filename so it is
 * safe to place in a Content-Disposition header or a generated archive path.
 */
export function sanitizeDownloadFilename(filename: string): string {
  const base = filename.split(/[/\\]/u).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f"]/gu, '')
    .replace(/^\.+/u, '')
    .trim();
  return cleaned.length === 0 ? 'document' : cleaned.slice(0, 255);
}

export interface SubmissionFileSelection {
  field: CollectionField;
  files: CollectionFile[];
}

/**
 * Revalidates the whole file selection at submission time.
 *
 * Every rule is checked again here against current database state, because the
 * upload-time checks ran against a request that may since have changed: a file
 * may have failed inspection, or the totals may only now exceed the cap.
 */
export function findSubmissionFileError(
  selections: SubmissionFileSelection[],
  actor: { studentAccountId: string; formId: string },
): { code: string; fieldId: string | null } | null {
  let totalBytes = 0;

  for (const { field, files } of selections) {
    if (field.type !== 'file_upload' || field.file === undefined) continue;

    if (field.required && files.length === 0) {
      return { code: 'FILE_REQUIRED', fieldId: field.id };
    }
    const maxFiles = Math.min(field.file.maxFiles, MAX_FILES_PER_FIELD);
    if (files.length > maxFiles) return { code: 'FILE_COUNT_EXCEEDED', fieldId: field.id };

    for (const file of files) {
      /*
       * Ownership and binding are rechecked rather than assumed: a file reference
       * supplied by a browser must not reach another Student's document or another
       * form's field.
       */
      if (
        file.studentAccountId !== actor.studentAccountId ||
        file.formId !== actor.formId ||
        file.fieldId !== field.id
      ) {
        return { code: 'FILE_NOT_ACCESSIBLE', fieldId: field.id };
      }
      if (file.status !== 'ready') return { code: 'FILE_NOT_READY', fieldId: field.id };
      if (file.byteSize > MAX_FILE_BYTES) return { code: 'FILE_TOO_LARGE', fieldId: field.id };

      const detected = file.detectedContentType;
      const detectedType = detected === null ? null : fileTypeFromDeclared(detected);
      if (detectedType === null || !field.file.allowedFileTypes.includes(detectedType)) {
        return { code: 'FILE_TYPE_NOT_ALLOWED', fieldId: field.id };
      }
      totalBytes += file.byteSize;
    }
  }

  if (totalBytes > MAX_SUBMISSION_BYTES) {
    return { code: 'SUBMISSION_TOO_LARGE', fieldId: null };
  }
  return null;
}
