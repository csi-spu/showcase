import { describe, expect, it } from 'vitest';
import type { InstructorReviewEntry } from '@/lib/instructor-collection-forms-contract';
import { looksLikeStudentId, viewReviewQueue } from './review-queue-view';

function entry(
  index: number,
  status: InstructorReviewEntry['status'],
  submittedAt: string | null,
  firstNameTh = `ชื่อ${index}`,
): InstructorReviewEntry {
  return {
    firstSubmittedAt: submittedAt,
    isLate: false,
    latestCheckingReason: null,
    latestSubmission:
      submittedAt === null
        ? null
        : {
            answers: {},
            fields: [],
            files: {},
            formVersion: 1,
            id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            submittedAt,
            version: 1,
          },
    rosterName: { firstNameTh, lastNameTh: `สกุล${index}` },
    status,
    studentAccountId: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
}

const ENTRIES = [
  entry(1, 'passed', '2026-09-01T02:00:00.000Z', 'กมล'),
  entry(2, 'not_submitted', null, 'ขวัญ'),
  entry(3, 'awaiting_checking', '2026-09-03T02:00:00.000Z', 'คณิน'),
  entry(4, 'awaiting_checking', '2026-09-02T02:00:00.000Z', 'งามตา'),
];

const QUERY = { page: 1, pageSize: 10, search: '', sort: 'status', status: 'all' } as const;

function names(rows: InstructorReviewEntry[]): string[] {
  return rows.map((row) => row.rosterName.firstNameTh);
}

describe('viewReviewQueue', () => {
  it('opens on the work waiting for review, then by name', () => {
    expect(names(viewReviewQueue(ENTRIES, QUERY).rows)).toEqual(['คณิน', 'งามตา', 'ขวัญ', 'กมล']);
  });

  it('sorts by submission time either way and keeps unsubmitted entries last', () => {
    expect(names(viewReviewQueue(ENTRIES, { ...QUERY, sort: 'submittedDesc' }).rows)).toEqual([
      'คณิน',
      'งามตา',
      'กมล',
      'ขวัญ',
    ]);
    expect(names(viewReviewQueue(ENTRIES, { ...QUERY, sort: 'submittedAsc' }).rows)).toEqual([
      'กมล',
      'งามตา',
      'คณิน',
      'ขวัญ',
    ]);
  });

  it('counts statuses within the search and filters by the chosen one', () => {
    const view = viewReviewQueue(ENTRIES, { ...QUERY, search: '  สกุล3 ', status: 'all' });
    expect(names(view.rows)).toEqual(['คณิน']);
    expect(view.statusCounts).toMatchObject({ all: 1, awaiting_checking: 1, passed: 0 });

    const filtered = viewReviewQueue(ENTRIES, { ...QUERY, status: 'awaiting_checking' });
    expect(filtered.total).toBe(2);
    expect(filtered.statusCounts.all).toBe(4);
  });

  it('pages the result and clamps a page that no longer exists', () => {
    const many = Array.from({ length: 23 }, (_, index) => entry(index, 'not_submitted', null));
    const last = viewReviewQueue(many, { ...QUERY, page: 9 });
    expect(last).toMatchObject({ page: 3, pageCount: 3, total: 23 });
    expect(last.rows).toHaveLength(3);
  });
});

describe('looksLikeStudentId', () => {
  it('recognises digits only', () => {
    expect(looksLikeStudentId(' 65012345 ')).toBe(true);
    expect(looksLikeStudentId('สมชาย')).toBe(false);
  });
});
