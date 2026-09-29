import { describe, expect, it } from 'vitest';
import type {
  InstructorReviewPosition,
  InstructorReviewStudent,
} from '@/lib/instructor-collection-forms-contract';
import { jumpListStudents } from './jump-list';

function student(index: number): InstructorReviewStudent {
  return {
    rosterName: { firstNameTh: `ชื่อ${index}`, lastNameTh: 'สกุล' },
    studentAccountId: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
}

const CURRENT = student(9);
const PAGE = [student(1), student(2), student(3)];

function place(
  position: number | null,
  previous: InstructorReviewStudent | null,
): InstructorReviewPosition {
  return {
    entry: {
      ...CURRENT,
      firstSubmittedAt: '2026-09-01T02:00:00.000Z',
      isLate: false,
      latestCheckingReason: null,
      latestSubmission: {
        formVersion: 1,
        id: '50000000-0000-4000-8000-000000000009',
        submittedAt: '2026-09-01T02:00:00.000Z',
        version: 1,
      },
      status: 'passed',
      studentId: '66000009',
    },
    next: null,
    page: 1,
    pageStudents: PAGE,
    position,
    previous,
    total: 3,
  };
}

const ids = (students: InstructorReviewStudent[]) =>
  students.map((candidate) => candidate.studentAccountId);

describe('jumpListStudents', () => {
  it('offers the page as Core listed it when the Student is in the filter', () => {
    expect(
      jumpListStudents({ ...place(2, PAGE[0]!), pageStudents: [PAGE[0]!, CURRENT, PAGE[2]!] }),
    ).toEqual([PAGE[0], CURRENT, PAGE[2]]);
  });

  it('puts a Student the filter excludes right after their previous neighbour', () => {
    expect(ids(jumpListStudents(place(null, PAGE[1]!)))).toEqual(
      ids([PAGE[0]!, PAGE[1]!, CURRENT, PAGE[2]!]),
    );
  });

  it('puts them first when their previous neighbour is on an earlier page or there is none', () => {
    expect(ids(jumpListStudents(place(null, student(7))))).toEqual(ids([CURRENT, ...PAGE]));
    expect(ids(jumpListStudents(place(null, null)))).toEqual(ids([CURRENT, ...PAGE]));
  });
});
