import type { CollectionStudentAttentionCursor } from './collection-overview.ports';

const CURSOR_VERSION = 'v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_CURSOR_LENGTH = 256;

/**
 * Encodes the position of the last row already shown.
 *
 * The payload is the sort key and nothing else: a deadline, a form id and an
 * account id. A Student ID is never part of it -- the cursor travels in a query
 * string, and Student IDs must never appear in one.
 *
 * base64url keeps the value opaque to a reader and safe in a URL. It is not a
 * secret: every part is already a value the caller is authorized to see, so it
 * is encoded for tamper-evidence of shape only, and the repository still
 * applies the Instructor's scope to the page it returns.
 */
export function encodeAttentionCursor(cursor: CollectionStudentAttentionCursor): string {
  const deadline = cursor.deadlineAt === null ? '' : cursor.deadlineAt.toISOString();
  return Buffer.from(
    `${CURSOR_VERSION}\u0000${deadline}\u0000${cursor.formId}\u0000${cursor.studentAccountId}`,
    'utf8',
  ).toString('base64url');
}

/**
 * Decodes a cursor supplied by a client.
 *
 * Returns null for anything malformed so the caller can reject the request
 * rather than silently restarting the page, which would loop a paging client.
 */
export function decodeAttentionCursor(value: string): CollectionStudentAttentionCursor | null {
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH) return null;

  const parts = Buffer.from(value, 'base64url').toString('utf8').split('\u0000');
  if (parts.length !== 4) return null;

  const [version, deadline, formId, studentAccountId] = parts;
  if (version !== CURSOR_VERSION) return null;
  if (formId === undefined || !UUID_PATTERN.test(formId)) return null;
  if (studentAccountId === undefined || !UUID_PATTERN.test(studentAccountId)) return null;

  if (deadline === undefined) return null;
  if (deadline === '') {
    return { deadlineAt: null, formId, studentAccountId };
  }

  const deadlineAt = new Date(deadline);
  if (Number.isNaN(deadlineAt.getTime())) return null;
  return { deadlineAt, formId, studentAccountId };
}
