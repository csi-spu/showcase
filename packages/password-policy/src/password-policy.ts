export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** The Supabase Auth password symbol set, so a hosted requirement can never be stricter. */
export const PASSWORD_SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';

export const PASSWORD_REQUIREMENT_KEYS = [
  'length',
  'lowercase',
  'uppercase',
  'number',
  'symbol',
] as const;

export type PasswordRequirement = (typeof PASSWORD_REQUIREMENT_KEYS)[number];
export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordEvaluation {
  isValid: boolean;
  percentage: number;
  requirements: Record<PasswordRequirement, boolean>;
  strength: PasswordStrength;
}

const SYMBOLS = new Set(Array.from(PASSWORD_SYMBOLS));

/**
 * Evaluates the rules checkable without Account context. Core additionally rejects the
 * current password and the Student ID. Length counts UTF-16 code units, matching Core.
 */
export function evaluatePassword(password: string): PasswordEvaluation {
  const requirements = {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: Array.from(password).some((character) => SYMBOLS.has(character)),
    uppercase: /[A-Z]/.test(password),
  } satisfies Record<PasswordRequirement, boolean>;
  const satisfiedCount = PASSWORD_REQUIREMENT_KEYS.filter(
    (requirement) => requirements[requirement],
  ).length;

  return {
    isValid: satisfiedCount === PASSWORD_REQUIREMENT_KEYS.length,
    percentage: (satisfiedCount / PASSWORD_REQUIREMENT_KEYS.length) * 100,
    requirements,
    strength: strengthFor(satisfiedCount),
  };
}

function strengthFor(satisfiedCount: number): PasswordStrength {
  if (satisfiedCount <= 1) return 'weak';
  if (satisfiedCount === 2) return 'fair';
  if (satisfiedCount <= 4) return 'good';
  return 'strong';
}
