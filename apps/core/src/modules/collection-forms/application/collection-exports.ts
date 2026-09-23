/*
 * Export policy for the private collection.
 *
 * Three rules shape everything here:
 *
 * - The snapshot is frozen when Core accepts the request. Excel and ZIP from
 *   one request read the same frozen rows, so a submission or a checking
 *   decision made a minute later cannot change what a retry produces. Getting
 *   newer data means requesting a new export.
 * - Authorization is rechecked at download even though the data is frozen. An
 *   Instructor whose role was withdrawn after requesting an export must not be
 *   able to collect it.
 * - A Student ID never appears in an archive. Folder names are built from the
 *   display name plus a short opaque suffix, which is also what keeps two
 *   Students with the same name in separate folders.
 */

/**
 * Thrown when a snapshot would exceed the export scope limit.
 *
 * A dedicated type rather than a status code, because the transaction that
 * raises it must roll the whole snapshot back: half a tracking sheet is worse
 * than a refusal an Instructor can act on.
 */
export class CollectionExportTooLargeError extends Error {
  constructor() {
    super('COLLECTION_EXPORT_TOO_LARGE');
    this.name = 'CollectionExportTooLargeError';
  }
}

/** The two artifacts one request can produce. Both read the same snapshot. */
export type CollectionExportKind = 'excel' | 'zip';

export type CollectionExportStatus = 'pending' | 'building' | 'ready' | 'failed' | 'expired';

/*
 * A generated artifact is readable for 24 hours after it becomes ready. After
 * that the Instructor requests a new export, which is also a new snapshot.
 */
export const EXPORT_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1000;

/* Bounds one request's snapshot, so a single export cannot become unbounded. */
export const MAX_EXPORT_FORMS = 30;
export const MAX_EXPORT_STUDENTS = 1_000;

/* Bounds one worker pass, leaving a large backlog to drain over several polls. */
export const MAX_EXPORTS_PER_RUN = 5;

/* How long a worker may hold a claim before another may retry the job. */
export const EXPORT_LEASE_SECONDS = 600;

/*
 * Attempts before an export is failed for good. Failure exposes retry to the
 * Instructor rather than leaving a partial archive that looks successful.
 */
export const MAX_EXPORT_ATTEMPTS = 3;

/** One page of an Instructor's export history. */
export const MAX_EXPORT_LIST = 20;

/* Signed download URLs are short-lived; the artifact's own expiry still rules. */
export const EXPORT_DOWNLOAD_URL_SECONDS = 120;

export const EXPORT_CONTENT_TYPES: Record<CollectionExportKind, string> = {
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

const EXPORT_EXTENSIONS: Record<CollectionExportKind, string> = { excel: 'xlsx', zip: 'zip' };

export function toExportStorageKey(exportId: string, kind: CollectionExportKind): string {
  return `collection-exports/${exportId}.${EXPORT_EXTENSIONS[kind]}`;
}

export function toExportExpiry(readyAt: Date): Date {
  return new Date(readyAt.getTime() + EXPORT_LIFETIME_MILLISECONDS);
}

/**
 * Whether a ready artifact may still be downloaded.
 *
 * Expiry is decided from the recorded instant, not from whether the bytes have
 * been physically removed: cleanup can lag, and a lagging sweep must never
 * become an extension of the artifact's life.
 */
export function isExportDownloadable(input: {
  expiresAt: Date | null;
  now: Date;
  status: CollectionExportStatus;
}): boolean {
  if (input.status !== 'ready' || input.expiresAt === null) return false;
  return input.now < input.expiresAt;
}

/*
 * Characters that make a path unsafe or unportable: separators and traversal,
 * Windows-reserved punctuation, and control characters. Replaced rather than
 * dropped so two different names cannot silently collapse into one.
 */
// eslint-disable-next-line no-control-regex -- excluding control characters is the point
const UNSAFE_PATH_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/gu;
const MAX_PATH_SEGMENT_LENGTH = 80;

/**
 * Makes one path segment safe to place inside an archive.
 *
 * Traversal is impossible by construction: separators are removed before
 * anything else, so no input can produce `..` as a segment of its own or reach
 * outside the archive root.
 */
export function toSafePathSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(UNSAFE_PATH_CHARACTERS, '_')
    .replace(/\s+/gu, ' ')
    .trim()
    /* A leading dot hides the entry; a trailing dot or space breaks Windows. */
    .replace(/^\.+/u, '')
    .replace(/[. ]+$/u, '')
    .slice(0, MAX_PATH_SEGMENT_LENGTH)
    .replace(/[. ]+$/u, '');
  return cleaned === '' ? fallback : cleaned;
}

/**
 * The folder one Student's documents go in.
 *
 * The suffix is the *position* in the frozen snapshot, never the Student ID and
 * never any part of the account id. It is what separates two Students who share
 * a display name, and it is meaningless outside this one archive.
 */
export function toStudentFolderName(input: { displayName: string; position: number }): string {
  const name = toSafePathSegment(input.displayName, 'student');
  return `${String(input.position + 1).padStart(3, '0')}-${name}`;
}

/**
 * The name one submitted document gets inside a Student's folder.
 *
 * The position prefix keeps two files with the same original name distinct, and
 * keeps the order stable between the archive and the workbook.
 */
export function toDocumentFileName(input: {
  fieldId: string;
  originalFilename: string;
  position: number;
}): string {
  const safe = toSafePathSegment(input.originalFilename, 'document');
  const field = toSafePathSegment(input.fieldId, 'field');
  return `${field}-${String(input.position + 1).padStart(2, '0')}-${safe}`;
}

/**
 * The full path of one document in the archive.
 *
 * Collisions are impossible rather than merely unlikely: the Student folder is
 * unique by snapshot position, and within it the form and field positions make
 * each document's name unique.
 */
export function toDocumentPath(input: {
  displayName: string;
  fieldId: string;
  formTitle: string;
  originalFilename: string;
  filePosition: number;
  formPosition: number;
  studentPosition: number;
}): string {
  const student = toStudentFolderName({
    displayName: input.displayName,
    position: input.studentPosition,
  });
  const form = `${String(input.formPosition + 1).padStart(2, '0')}-${toSafePathSegment(
    input.formTitle,
    'form',
  )}`;
  const file = toDocumentFileName({
    fieldId: input.fieldId,
    originalFilename: input.originalFilename,
    position: input.filePosition,
  });
  return `${student}/${form}/${file}`;
}

/**
 * Whether another attempt is worth making.
 *
 * A worker that crashed mid-archive has consumed an attempt; past the limit the
 * job is failed so the Instructor sees retry rather than silence.
 */
/*
 * Timestamps in a generated file are rendered here rather than left to a
 * reader. Core stores UTC and the frontends render Bangkok, but a workbook is
 * opened directly by staff with no frontend in between, so the file has to
 * carry the timezone the reader expects.
 */
const EXPORT_TIME_ZONE = 'Asia/Bangkok';

const EXPORT_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  timeZone: EXPORT_TIME_ZONE,
  year: 'numeric',
});

/** `23/09/2026 17:00`, in Asia/Bangkok. */
export function toExportDateTime(value: Date): string {
  const parts = new Map(
    EXPORT_DATE_FORMAT.formatToParts(value).map((part) => [part.type, part.value]),
  );
  const date = `${parts.get('day') ?? ''}/${parts.get('month') ?? ''}/${parts.get('year') ?? ''}`;
  return `${date} ${parts.get('hour') ?? ''}:${parts.get('minute') ?? ''}`;
}

/**
 * A stable code for a failed build.
 *
 * Deliberately coarse: an Instructor is told the export failed and can retry,
 * and the log carries no filename, answer text, or Student identifier. The
 * detail belongs in the worker's error report, not in a user-facing code.
 */
export function toExportErrorCode(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('COLLECTION_')) return error.message;
  return 'EXPORT_BUILD_FAILED';
}

export function canRetryExport(attemptCount: number): boolean {
  return attemptCount < MAX_EXPORT_ATTEMPTS;
}
