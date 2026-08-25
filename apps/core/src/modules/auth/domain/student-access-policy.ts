export interface StudentAccessPeriod {
  accessEndsAcademicYear: number;
  currentAcademicYear: number | null;
  entryYear: number;
}

export type StudentAccessEvaluation =
  | { canUseStudentCapabilities: false; state: 'alumnus' | 'unavailable' }
  | { canUseStudentCapabilities: true; state: 'student' };

export function evaluateStudentAccess(input: StudentAccessPeriod): StudentAccessEvaluation {
  if (input.currentAcademicYear === null) {
    return { canUseStudentCapabilities: false, state: 'unavailable' };
  }

  const canUseStudentCapabilities =
    input.currentAcademicYear >= input.entryYear &&
    input.currentAcademicYear <= input.accessEndsAcademicYear;

  return canUseStudentCapabilities
    ? { canUseStudentCapabilities: true, state: 'student' }
    : { canUseStudentCapabilities: false, state: 'alumnus' };
}
