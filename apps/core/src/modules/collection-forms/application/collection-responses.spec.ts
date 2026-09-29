import type { CollectionField } from './collection-field';
import {
  RESPONSE_SUMMARY_PAGE_SIZE,
  buildFieldSummaries,
  decodeAnswerCursor,
  decodeOffsetCursor,
  encodeAnswerCursor,
  encodeOffsetCursor,
  summarizeChoice,
  summarizeDates,
  summarizeNumbers,
} from './collection-responses';

describe('collection responses', () => {
  describe('summarizeChoice', () => {
    it('counts every current option in form order, including options nobody chose', () => {
      expect(
        summarizeChoice(
          ['ก', 'ข', 'ค'],
          [
            { count: 2, value: 'ค' },
            { count: 5, value: 'ก' },
          ],
        ),
      ).toEqual({
        options: [
          { count: 5, value: 'ก' },
          { count: 0, value: 'ข' },
          { count: 2, value: 'ค' },
        ],
        otherCount: 0,
      });
    });

    it('puts a value that is no longer an option into its own count instead of dropping it', () => {
      expect(
        summarizeChoice(
          ['ก'],
          [
            { count: 1, value: 'ก' },
            { count: 3, value: 'ตัวเลือกเดิม' },
            { count: 2, value: 'อีกตัวเลือกเดิม' },
          ],
        ),
      ).toEqual({ options: [{ count: 1, value: 'ก' }], otherCount: 5 });
    });
  });

  describe('summarizeNumbers', () => {
    it('has no statistics and no bars before anyone answers', () => {
      expect(summarizeNumbers([])).toEqual({ histogram: [], stats: null });
    });

    it('weights min, median, mean and max by how many Students gave each value', () => {
      const { stats } = summarizeNumbers([
        { count: 1, value: '10' },
        { count: 2, value: '2' },
        { count: 1, value: '4' },
      ]);
      /* The values are 2, 2, 4, 10: the median averages the middle pair. */
      expect(stats).toEqual({ max: 10, mean: 4.5, median: 3, min: 2 });
    });

    it('takes the middle value as the median when the count is odd', () => {
      expect(
        summarizeNumbers([
          { count: 2, value: '1' },
          { count: 1, value: '7' },
        ]).stats?.median,
      ).toBe(1);
    });

    it('gives each whole number its own bar when the range is small', () => {
      expect(
        summarizeNumbers([
          { count: 2, value: '1' },
          { count: 1, value: '3' },
        ]).histogram,
      ).toEqual([
        { count: 2, from: 1, to: 1 },
        { count: 0, from: 2, to: 2 },
        { count: 1, from: 3, to: 3 },
      ]);
    });

    it('splits a wide range into ten equal bars and keeps the maximum in the last one', () => {
      const { histogram } = summarizeNumbers([
        { count: 1, value: '0' },
        { count: 1, value: '55' },
        { count: 4, value: '100' },
      ]);
      expect(histogram).toHaveLength(10);
      expect(histogram[0]).toEqual({ count: 1, from: 0, to: 10 });
      expect(histogram[5]).toEqual({ count: 1, from: 50, to: 60 });
      expect(histogram[9]).toEqual({ count: 4, from: 90, to: 100 });
    });

    it('shows a single bar when every answer is the same fraction', () => {
      expect(summarizeNumbers([{ count: 3, value: '2.5' }]).histogram).toEqual([
        { count: 3, from: 2.5, to: 2.5 },
      ]);
    });
  });

  describe('summarizeDates', () => {
    it('reports the range and a bar per calendar month in order', () => {
      expect(
        summarizeDates([
          { count: 1, value: '2026-10-31' },
          { count: 2, value: '2026-09-01' },
          { count: 1, value: '2026-10-01' },
        ]),
      ).toEqual({
        earliest: '2026-09-01',
        latest: '2026-10-31',
        months: [
          { count: 2, month: '2026-09' },
          { count: 2, month: '2026-10' },
        ],
      });
    });

    it('has no range before anyone answers', () => {
      expect(summarizeDates([])).toEqual({ earliest: null, latest: null, months: [] });
    });
  });

  describe('buildFieldSummaries', () => {
    const empty = {
      answeredCounts: new Map<string, number>(),
      files: new Map<string, { fileCount: number; notReadyCount: number }>(),
      textAnswers: new Map<string, string[]>(),
      textGroups: new Map<string, Array<{ count: number; value: string }>>(),
      totals: { assigned: 0, awaitingChecking: 0, changesRequired: 0, notSubmitted: 0, passed: 0 },
      valueCounts: new Map<string, Array<{ count: number; value: string }>>(),
    };
    const field = (id: string, type: CollectionField['type'], options?: string[]) => ({
      description: '',
      id,
      label: id,
      required: false,
      type,
      ...(options === undefined ? {} : { options }),
    });

    it('follows the current form order and reports an unanswered question as zero', () => {
      const summaries = buildFieldSummaries(
        [field('b', 'single_choice', ['x']), field('a', 'file_upload')],
        empty,
      );
      expect(summaries).toEqual([
        {
          answeredCount: 0,
          fieldId: 'b',
          options: [{ count: 0, value: 'x' }],
          otherCount: 0,
          type: 'single_choice',
        },
        { answeredCount: 0, fieldId: 'a', fileCount: 0, notReadyCount: 0, type: 'file_upload' },
      ]);
    });

    it('returns the first text page and a cursor only when one more row was read', () => {
      const groups = Array.from({ length: RESPONSE_SUMMARY_PAGE_SIZE + 1 }, (_, index) => ({
        count: 1,
        value: `ค่า ${index}`,
      }));
      const [short, long] = buildFieldSummaries(
        [field('s', 'short_text'), field('l', 'long_text')],
        {
          ...empty,
          answeredCounts: new Map([
            ['l', 1],
            ['s', groups.length],
          ]),
          textAnswers: new Map([['l', ['ข้อความยาว']]]),
          textGroups: new Map([['s', groups]]),
        },
      );
      expect(short).toMatchObject({
        answeredCount: RESPONSE_SUMMARY_PAGE_SIZE + 1,
        groups: { nextCursor: encodeOffsetCursor(RESPONSE_SUMMARY_PAGE_SIZE) },
      });
      expect(short?.type === 'short_text' && short.groups.items).toHaveLength(
        RESPONSE_SUMMARY_PAGE_SIZE,
      );
      expect(long).toEqual({
        answeredCount: 1,
        answers: { items: [{ value: 'ข้อความยาว' }], nextCursor: null },
        fieldId: 'l',
        type: 'long_text',
      });
    });
  });

  describe('cursors', () => {
    it('round-trips an offset', () => {
      expect(decodeOffsetCursor(encodeOffsetCursor(40))).toBe(40);
    });

    it('round-trips an answer position without holding a Student ID', () => {
      const position = {
        accountId: '58000000-0000-4000-8000-000000000001',
        number: '-12.5',
        rank: 2,
        text: '2026-09-01',
      };
      const cursor = encodeAnswerCursor(position);
      expect(decodeAnswerCursor(cursor)).toEqual(position);
      expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toMatch(/\b\d{10}\b/u);
    });

    it.each([
      '',
      'not base64!',
      Buffer.from('o:-1').toString('base64url'),
      Buffer.from('o:1.5').toString('base64url'),
      Buffer.from('{}').toString('base64url'),
    ])('rejects an offset cursor it did not issue: %j', (cursor) => {
      expect(decodeOffsetCursor(cursor)).toBeNull();
    });

    it.each([
      '',
      encodeOffsetCursor(20),
      Buffer.from('[1]').toString('base64url'),
      Buffer.from(JSON.stringify({ a: 'x', n: '0', r: 0, t: '' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({ a: '58000000-0000-4000-8000-000000000001', n: '1e9', r: 0, t: '' }),
      ).toString('base64url'),
      Buffer.from(
        JSON.stringify({ a: '58000000-0000-4000-8000-000000000001', n: '0', r: -1, t: '' }),
      ).toString('base64url'),
    ])('rejects an answer cursor it did not issue: %j', (cursor) => {
      expect(decodeAnswerCursor(cursor)).toBeNull();
    });
  });
});
