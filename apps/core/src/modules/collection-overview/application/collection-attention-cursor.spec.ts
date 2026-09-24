import { decodeAttentionCursor, encodeAttentionCursor } from './collection-attention-cursor';

const FORM_ID = '00000000-0000-4000-8000-000000000011';
const STUDENT_ACCOUNT_ID = '00000000-0000-4000-8000-000000000012';

describe('attention cursor', () => {
  it('round-trips a deadline position', () => {
    const cursor = {
      deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
      formId: FORM_ID,
      studentAccountId: STUDENT_ACCOUNT_ID,
    };

    expect(decodeAttentionCursor(encodeAttentionCursor(cursor))).toEqual(cursor);
  });

  it('round-trips a position with no deadline', () => {
    const cursor = {
      deadlineAt: null,
      formId: FORM_ID,
      studentAccountId: STUDENT_ACCOUNT_ID,
    };

    expect(decodeAttentionCursor(encodeAttentionCursor(cursor))).toEqual(cursor);
  });

  /*
   * The cursor travels in a query string, where a Student ID must never
   * appear. It carries only the sort key, so nothing identifying can be
   * recovered from it.
   */
  it('encodes only the sort key, and is URL-safe', () => {
    const encoded = encodeAttentionCursor({
      deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
      formId: FORM_ID,
      studentAccountId: STUDENT_ACCOUNT_ID,
    });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encodeURIComponent(encoded)).toBe(encoded);
    expect(Buffer.from(encoded, 'base64url').toString('utf8')).toBe(
      `v1\u00002026-09-25T04:00:00.000Z\u0000${FORM_ID}\u0000${STUDENT_ACCOUNT_ID}`,
    );
  });

  it.each([
    ['empty', ''],
    ['not base64url', '!!!!'],
    ['too few parts', Buffer.from('v1\u0000x', 'utf8').toString('base64url')],
    [
      'an unknown version',
      Buffer.from(`v2\u0000\u0000${FORM_ID}\u0000${STUDENT_ACCOUNT_ID}`, 'utf8').toString(
        'base64url',
      ),
    ],
    [
      'a non-uuid form id',
      Buffer.from(`v1\u0000\u0000nope\u0000${STUDENT_ACCOUNT_ID}`, 'utf8').toString('base64url'),
    ],
    [
      'a non-uuid account id',
      Buffer.from(`v1\u0000\u0000${FORM_ID}\u0000nope`, 'utf8').toString('base64url'),
    ],
    [
      'an unparseable deadline',
      Buffer.from(`v1\u0000never\u0000${FORM_ID}\u0000${STUDENT_ACCOUNT_ID}`, 'utf8').toString(
        'base64url',
      ),
    ],
    ['an oversized value', 'a'.repeat(257)],
  ])('rejects %s', (_label, value) => {
    expect(decodeAttentionCursor(value)).toBeNull();
  });
});
