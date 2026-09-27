import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstructorMatrixPage } from '@/lib/instructor-collection-forms-core';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { MatrixTable } from './matrix-table';

const FORM_ID = '20000000-0000-4000-8000-000000000001';

function row(index: number, studentId: string | null): InstructorMatrixPage['rows'][number] {
  return {
    cells: [{ formId: FORM_ID, isLate: false, status: 'not_submitted' }],
    isWithdrawn: false,
    rosterName: { firstNameTh: `ชื่อ${index}`, lastNameTh: `สกุล${index}` },
    studentAccountId: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    studentId,
  };
}

const PAGE: InstructorMatrixPage = {
  forms: [{ deadlineAt: null, id: FORM_ID, status: 'open', title: 'แบบฟอร์ม' }],
  nextCursor: null,
  rows: [row(1, '66000001'), row(2, null)],
  summary: {
    awaitingChecking: 0,
    changesRequired: 0,
    late: 0,
    notRequired: 0,
    notSubmitted: 2,
    passed: 0,
    withdrawn: 0,
  },
  totalMembers: 2,
};

afterEach(cleanup);

describe('MatrixTable', () => {
  it('shows each Student ID in the row header', async () => {
    render(await MatrixTable({ page: PAGE }));

    const [recorded, unrecorded] = screen.getAllByRole('rowheader');
    expect(within(recorded!).getByText('66000001')).toBeTruthy();
    expect(within(unrecorded!).getByText('matrix.studentIdMissing')).toBeTruthy();
  });
});
