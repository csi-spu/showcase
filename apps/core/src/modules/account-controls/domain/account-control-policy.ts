export type MonotonicChange = 'advanced' | 'extended' | 'invalid' | 'unchanged';

export function evaluateAcademicYearChange(
  currentAcademicYear: number | null,
  proposedAcademicYear: number,
): Extract<MonotonicChange, 'advanced' | 'invalid' | 'unchanged'> {
  if (currentAcademicYear === null || proposedAcademicYear > currentAcademicYear) {
    return 'advanced';
  }
  return proposedAcademicYear === currentAcademicYear ? 'unchanged' : 'invalid';
}

export function evaluateAccessExtension(
  currentAccessEndsAcademicYear: number,
  proposedAccessEndsAcademicYear: number,
): Extract<MonotonicChange, 'extended' | 'invalid' | 'unchanged'> {
  if (proposedAccessEndsAcademicYear > currentAccessEndsAcademicYear) {
    return 'extended';
  }
  return proposedAccessEndsAcademicYear === currentAccessEndsAcademicYear ? 'unchanged' : 'invalid';
}
