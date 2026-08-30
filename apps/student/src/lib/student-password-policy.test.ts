import { describe, expect, it } from 'vitest';
import { evaluateStudentPassword } from './student-password-policy';

describe('Student chosen-password policy', () => {
  it.each([
    ['length', 'Aa1!short', 'length'],
    ['lowercase letter', 'UPPERCASE123!', 'lowercase'],
    ['uppercase letter', 'lowercase123!', 'uppercase'],
    ['number', 'NoNumbersHere!', 'number'],
    ['symbol', 'NoSymbolsHere123', 'symbol'],
  ] as const)('identifies a missing %s requirement', (_case, password, missingRequirement) => {
    const result = evaluateStudentPassword(password);

    expect(result.requirements[missingRequirement]).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it('reports full strength only when every composition requirement passes', () => {
    expect(evaluateStudentPassword('StrongPassword1!')).toEqual({
      isValid: true,
      percentage: 100,
      requirements: {
        length: true,
        lowercase: true,
        number: true,
        symbol: true,
        uppercase: true,
      },
      strength: 'strong',
    });
  });
});
