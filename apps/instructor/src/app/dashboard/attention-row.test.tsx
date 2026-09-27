import type { ComponentProps } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { InstructorStudentAttentionRow } from '@/lib/instructor-collection-overview-core';
import { AttentionRow } from './attention-row';

const t = ((key: string) => key) as unknown as ComponentProps<typeof AttentionRow>['t'];

const ROW: InstructorStudentAttentionRow = {
  deadlineAt: null,
  firstNameTh: 'สมหญิง',
  formId: '20000000-0000-4000-8000-000000000001',
  formTitle: 'เอกสารฝึกงาน',
  groupId: '10000000-0000-4000-8000-000000000001',
  groupName: 'CS67-1',
  isLate: false,
  lastNameTh: 'ใจดี',
  roundId: '30000000-0000-4000-8000-000000000001',
  roundName: 'ชุดงานฝึกงาน',
  status: 'not_submitted',
  studentAccountId: '40000000-0000-4000-8000-000000000001',
  studentId: '66012345',
};

afterEach(cleanup);

describe('AttentionRow', () => {
  it('identifies the Student by Student ID and Roster name', () => {
    render(<AttentionRow row={ROW} t={t} />);
    expect(screen.getByRole('link').textContent).toContain('66012345 สมหญิง ใจดี');
  });

  it('marks a Student ID that no Roster import has recorded', () => {
    render(<AttentionRow row={{ ...ROW, studentId: null }} t={t} />);
    expect(screen.getByText('studentIdMissing')).toBeTruthy();
  });

  it('keeps the Student ID out of the link', () => {
    render(<AttentionRow row={ROW} t={t} />);
    expect(screen.getByRole('link').getAttribute('href')).not.toContain('66012345');
  });
});
