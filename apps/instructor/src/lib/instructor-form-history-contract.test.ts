import { describe, expect, it } from 'vitest';
import { formHistoryPageSchema } from './instructor-collection-forms-contract';

const page = {
  entries: [
    {
      actorName: 'สมชาย ใจดี',
      changes: [
        { kind: 'title_changed', next: 'B', previous: 'A' },
        { kind: 'deadline_changed', next: '2026-10-10T03:00:00.000Z', previous: null },
        { isRequired: true, kind: 'question_required_changed', label: 'บริษัท' },
        { kind: 'questions_reordered' },
      ],
      id: '58000000-0000-4000-8000-000000000001',
      occurredAt: '2026-09-29T03:00:00.000Z',
    },
    {
      actorName: 'สมชาย ใจดี',
      changes: [{ assignedCount: 2, kind: 'reopened', reason: 'ขยายเวลา' }],
      id: '58000000-0000-4000-8000-000000000002',
      occurredAt: '2026-09-28T03:00:00.000Z',
    },
  ],
  nextCursor: 'MTc5MDA3MTIwMDEyMzQ1Ng',
};

describe('formHistoryPageSchema', () => {
  it('accepts a history page projected by Core', () => {
    expect(formHistoryPageSchema.parse(page)).toEqual(page);
  });

  it('rejects Student data on an entry', () => {
    const [entry] = page.entries;
    expect(() =>
      formHistoryPageSchema.parse({ ...page, entries: [{ ...entry, studentId: '66000001' }] }),
    ).toThrow();
  });

  it('rejects a change kind it cannot describe', () => {
    const [entry] = page.entries;
    expect(() =>
      formHistoryPageSchema.parse({
        ...page,
        entries: [{ ...entry, changes: [{ kind: 'answers_changed' }] }],
      }),
    ).toThrow();
  });
});
