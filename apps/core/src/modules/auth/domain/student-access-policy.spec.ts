import { evaluateStudentAccess } from './student-access-policy';

describe('Student Access Period policy', () => {
  it.each([
    [2569, true],
    [2576, true],
    [2568, false],
    [2577, false],
  ])('evaluates academic year %s against the inclusive period', (currentAcademicYear, expected) => {
    expect(
      evaluateStudentAccess({
        accessEndsAcademicYear: 2576,
        currentAcademicYear,
        entryYear: 2569,
      }),
    ).toEqual({
      canUseStudentCapabilities: expected,
      state: expected ? 'student' : 'alumnus',
    });
  });

  it('fails closed when Current Academic Year is missing', () => {
    expect(
      evaluateStudentAccess({
        accessEndsAcademicYear: 2576,
        currentAcademicYear: null,
        entryYear: 2569,
      }),
    ).toEqual({ canUseStudentCapabilities: false, state: 'unavailable' });
  });
});
