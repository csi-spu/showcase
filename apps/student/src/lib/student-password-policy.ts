export const STUDENT_PASSWORD_REQUIREMENT_KEYS = [
  'length',
  'lowercase',
  'uppercase',
  'number',
  'symbol',
] as const;

export type StudentPasswordRequirement = (typeof STUDENT_PASSWORD_REQUIREMENT_KEYS)[number];
export type StudentPasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

interface StudentPasswordEvaluation {
  isValid: boolean;
  percentage: number;
  requirements: Record<StudentPasswordRequirement, boolean>;
  strength: StudentPasswordStrength;
}

const SUPABASE_PASSWORD_SYMBOLS = new Set(Array.from('!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~'));

export function evaluateStudentPassword(password: string): StudentPasswordEvaluation {
  const requirements = {
    length: password.length >= 12 && password.length <= 128,
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: Array.from(password).some((character) => SUPABASE_PASSWORD_SYMBOLS.has(character)),
    uppercase: /[A-Z]/.test(password),
  } satisfies Record<StudentPasswordRequirement, boolean>;
  const satisfiedCount = STUDENT_PASSWORD_REQUIREMENT_KEYS.filter(
    (requirement) => requirements[requirement],
  ).length;

  return {
    isValid: satisfiedCount === STUDENT_PASSWORD_REQUIREMENT_KEYS.length,
    percentage: (satisfiedCount / STUDENT_PASSWORD_REQUIREMENT_KEYS.length) * 100,
    requirements,
    strength: strengthFor(satisfiedCount),
  };
}

function strengthFor(satisfiedCount: number): StudentPasswordStrength {
  if (satisfiedCount <= 1) return 'weak';
  if (satisfiedCount === 2) return 'fair';
  if (satisfiedCount <= 4) return 'good';
  return 'strong';
}
