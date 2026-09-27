import { describe, expect, it } from 'vitest';
import { matrixPageSchema } from './instructor-collection-forms-contract';

/*
 * The strict parse is load-bearing. A Core response field that is not declared
 * here is rejected at runtime and surfaces as a generic error, so these tests
 * pin the shape rather than trusting that the two sides stayed in step.
 */
const cell = {
  formId: '58000000-0000-4000-8000-000000000001',
  isLate: false,
  status: 'not_submitted',
};

const row = {
  cells: [cell],
  isWithdrawn: false,
  rosterName: { firstNameTh: 'นักศึกษา', lastNameTh: 'ทดสอบ' },
  studentAccountId: '58000000-0000-4000-8000-000000000002',
  studentId: '66000001',
};

const page = {
  forms: [
    {
      deadlineAt: '2026-09-20T17:00:00.000Z',
      id: '58000000-0000-4000-8000-000000000001',
      status: 'open',
      title: 'แบบฟอร์ม',
    },
  ],
  nextCursor: null,
  rows: [row],
  summary: {
    awaitingChecking: 0,
    changesRequired: 0,
    late: 0,
    notRequired: 0,
    notSubmitted: 1,
    passed: 0,
    withdrawn: 0,
  },
  totalMembers: 1,
};

describe('matrixPageSchema', () => {
  it('accepts a page as Core sends it', () => {
    expect(matrixPageSchema.parse(page)).toMatchObject({ totalMembers: 1 });
  });

  it('accepts a member whose Student ID is not yet recorded', () => {
    const parsed = matrixPageSchema.parse({ ...page, rows: [{ ...row, studentId: null }] });
    expect(parsed.rows[0]?.studentId).toBeNull();
  });

  it('rejects a Student ID that is not eight digits', () => {
    expect(() =>
      matrixPageSchema.parse({ ...page, rows: [{ ...row, studentId: '6600' }] }),
    ).toThrow();
  });

  it('accepts the matrix-only not_required cell state', () => {
    const parsed = matrixPageSchema.parse({
      ...page,
      rows: [{ ...row, cells: [{ ...cell, status: 'not_required' }] }],
    });
    expect(parsed.rows[0]?.cells[0]?.status).toBe('not_required');
  });

  it('accepts every stored obligation status a cell can carry', () => {
    for (const status of [
      'awaiting_checking',
      'changes_required',
      'not_submitted',
      'passed',
      'withdrawn',
    ]) {
      expect(() =>
        matrixPageSchema.parse({
          ...page,
          rows: [{ ...row, cells: [{ ...cell, status }] }],
        }),
      ).not.toThrow();
    }
  });

  it('carries a cursor when Core says there is another page', () => {
    const parsed = matrixPageSchema.parse({
      ...page,
      nextCursor: '58000000-0000-4000-8000-000000000002',
    });
    expect(parsed.nextCursor).toBe('58000000-0000-4000-8000-000000000002');
  });

  /* The drift that broke round closure once: a field Core sends but nobody declared. */
  it('rejects an undeclared field rather than silently dropping it', () => {
    expect(() => matrixPageSchema.parse({ ...page, studentIds: ['65000001'] })).toThrow();
  });

  it('rejects a summary that is missing a count', () => {
    const partial: Record<string, number> = { ...page.summary };
    delete partial.late;
    expect(() => matrixPageSchema.parse({ ...page, summary: partial })).toThrow();
  });

  it('rejects an invented cell state', () => {
    expect(() =>
      matrixPageSchema.parse({
        ...page,
        rows: [{ ...row, cells: [{ ...cell, status: 'maybe' }] }],
      }),
    ).toThrow();
  });
});
