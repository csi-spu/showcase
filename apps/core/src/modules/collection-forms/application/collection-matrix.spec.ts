import {
  MAX_MATRIX_ROWS,
  boundMatrixLimit,
  buildMatrixRows,
  summarizeMatrix,
  type MatrixMemberInput,
  type MatrixObligationInput,
} from './collection-matrix';

const deadline = new Date('2026-09-20T17:00:00.000Z');

function member(id: string, isWithdrawn = false): MatrixMemberInput {
  return {
    isWithdrawn,
    rosterName: { firstNameTh: 'ก', lastNameTh: id },
    studentAccountId: id,
    studentId: null,
  };
}

function obligation(overrides: Partial<MatrixObligationInput> = {}): MatrixObligationInput {
  return {
    deadlineAt: deadline,
    firstSubmittedAt: null,
    formId: 'form-1',
    status: 'not_submitted',
    studentAccountId: 'student-1',
    ...overrides,
  };
}

describe('buildMatrixRows', () => {
  it('gives every member a cell for every form on the page', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1', 'form-2'],
      members: [member('student-1'), member('student-2')],
      obligations: [obligation()],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.cells.map((cell) => cell.formId)).toEqual(['form-1', 'form-2']);
    expect(rows[1]?.cells.map((cell) => cell.formId)).toEqual(['form-1', 'form-2']);
  });

  it('carries each member Student ID for Instructor display', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1'],
      members: [{ ...member('student-1'), studentId: '69000001' }, member('student-2')],
      obligations: [],
    });
    expect(rows.map((row) => row.studentId)).toEqual(['69000001', null]);
  });

  /*
   * The distinction the whole view exists for: a Student who was never assigned
   * a form has not failed to submit it.
   */
  it('reports an unassigned cell as not_required, not as not_submitted', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1', 'form-2'],
      members: [member('student-1')],
      obligations: [obligation({ formId: 'form-1' })],
    });
    expect(rows[0]?.cells[0]?.status).toBe('not_submitted');
    expect(rows[0]?.cells[1]?.status).toBe('not_required');
  });

  it('keeps each member to their own obligations', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1'],
      members: [member('student-1'), member('student-2')],
      obligations: [obligation({ status: 'passed', studentAccountId: 'student-2' })],
    });
    expect(rows[0]?.cells[0]?.status).toBe('not_required');
    expect(rows[1]?.cells[0]?.status).toBe('passed');
  });

  it('marks a first submission after the deadline as late', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1'],
      members: [member('student-1')],
      obligations: [
        obligation({
          firstSubmittedAt: new Date('2026-09-21T09:00:00.000Z'),
          status: 'awaiting_checking',
        }),
      ],
    });
    expect(rows[0]?.cells[0]).toMatchObject({ isLate: true, status: 'awaiting_checking' });
  });

  /* Lateness is derived, so an extension must clear it without touching a row. */
  it('clears lateness when the deadline has been extended past the first submission', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1'],
      members: [member('student-1')],
      obligations: [
        obligation({
          deadlineAt: new Date('2026-09-30T17:00:00.000Z'),
          firstSubmittedAt: new Date('2026-09-21T09:00:00.000Z'),
          status: 'passed',
        }),
      ],
    });
    expect(rows[0]?.cells[0]).toMatchObject({ isLate: false, status: 'passed' });
  });

  it('never calls an unassigned cell late', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1'],
      members: [member('student-1')],
      obligations: [],
    });
    expect(rows[0]?.cells[0]).toMatchObject({ isLate: false, status: 'not_required' });
  });

  it('keeps a withdrawn member on the matrix', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1'],
      members: [member('student-1', true)],
      obligations: [obligation({ status: 'withdrawn' })],
    });
    expect(rows[0]?.isWithdrawn).toBe(true);
    expect(rows[0]?.cells[0]?.status).toBe('withdrawn');
  });

  it('preserves the member order it was given', () => {
    const rows = buildMatrixRows({
      formIds: [],
      members: [member('b'), member('a'), member('c')],
      obligations: [],
    });
    expect(rows.map((row) => row.studentAccountId)).toEqual(['b', 'a', 'c']);
  });
});

describe('summarizeMatrix', () => {
  it('counts each status across the page', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1', 'form-2'],
      members: [member('student-1'), member('student-2')],
      obligations: [
        obligation({ formId: 'form-1', status: 'passed', studentAccountId: 'student-1' }),
        obligation({ formId: 'form-2', status: 'not_submitted', studentAccountId: 'student-1' }),
        obligation({
          formId: 'form-1',
          status: 'awaiting_checking',
          studentAccountId: 'student-2',
        }),
      ],
    });
    expect(summarizeMatrix(rows)).toEqual({
      awaitingChecking: 1,
      changesRequired: 0,
      late: 0,
      notRequired: 1,
      notSubmitted: 1,
      passed: 1,
      withdrawn: 0,
    });
  });

  /*
   * Lateness overlaps the status counts rather than partitioning them: a late
   * submission is still awaiting checking, or still passed.
   */
  it('counts lateness alongside the status rather than instead of it', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1'],
      members: [member('student-1')],
      obligations: [
        obligation({
          firstSubmittedAt: new Date('2026-09-21T09:00:00.000Z'),
          status: 'passed',
        }),
      ],
    });
    const summary = summarizeMatrix(rows);
    expect(summary.passed).toBe(1);
    expect(summary.late).toBe(1);
  });

  it('separates not_required from not_submitted in the totals', () => {
    const rows = buildMatrixRows({
      formIds: ['form-1', 'form-2'],
      members: [member('student-1')],
      obligations: [obligation({ formId: 'form-1' })],
    });
    const summary = summarizeMatrix(rows);
    expect(summary.notSubmitted).toBe(1);
    expect(summary.notRequired).toBe(1);
  });

  it('counts nothing for an empty page', () => {
    expect(summarizeMatrix([])).toEqual({
      awaitingChecking: 0,
      changesRequired: 0,
      late: 0,
      notRequired: 0,
      notSubmitted: 0,
      passed: 0,
      withdrawn: 0,
    });
  });
});

describe('boundMatrixLimit', () => {
  it('defaults to the maximum when nothing was requested', () => {
    expect(boundMatrixLimit(undefined)).toBe(MAX_MATRIX_ROWS);
  });

  it('honours a smaller request', () => {
    expect(boundMatrixLimit(10)).toBe(10);
  });

  it('clamps a larger request to the bound', () => {
    expect(boundMatrixLimit(5_000)).toBe(MAX_MATRIX_ROWS);
  });

  it('falls back to the bound for a nonsense request', () => {
    expect(boundMatrixLimit(0)).toBe(MAX_MATRIX_ROWS);
    expect(boundMatrixLimit(-1)).toBe(MAX_MATRIX_ROWS);
    expect(boundMatrixLimit(1.5)).toBe(MAX_MATRIX_ROWS);
  });
});
