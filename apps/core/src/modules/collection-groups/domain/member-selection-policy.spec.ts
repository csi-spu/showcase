import { evaluateSelectionStatus } from './member-selection-policy';

const WITHIN_ACCESS = {
  accessEndsAcademicYear: 2572,
  currentAcademicYear: 2569,
  entryYear: 2569,
  membershipStatus: null,
} as const;

describe('evaluateSelectionStatus', () => {
  it('selects a Student within the effective Student Access Period who is not a member', () => {
    expect(evaluateSelectionStatus(WITHIN_ACCESS)).toBe('selectable');
  });

  it('honours an Admin extension recorded as a later access end year', () => {
    expect(
      evaluateSelectionStatus({
        ...WITHIN_ACCESS,
        accessEndsAcademicYear: 2576,
        currentAcademicYear: 2575,
        entryYear: 2565,
      }),
    ).toBe('selectable');
  });

  it('marks a Student outside the access period or not yet entered as no_access', () => {
    expect(evaluateSelectionStatus({ ...WITHIN_ACCESS, currentAcademicYear: 2573 })).toBe(
      'no_access',
    );
    expect(evaluateSelectionStatus({ ...WITHIN_ACCESS, entryYear: 2570 })).toBe('no_access');
  });

  it('fails closed when the Current Academic Year is not configured', () => {
    expect(evaluateSelectionStatus({ ...WITHIN_ACCESS, currentAcademicYear: null })).toBe(
      'no_access',
    );
  });

  it('reports existing membership before access, so members are never offered again', () => {
    expect(evaluateSelectionStatus({ ...WITHIN_ACCESS, membershipStatus: 'current' })).toBe(
      'current_member',
    );
    expect(
      evaluateSelectionStatus({
        ...WITHIN_ACCESS,
        currentAcademicYear: null,
        membershipStatus: 'withdrawn',
      }),
    ).toBe('withdrawn_member');
  });
});
