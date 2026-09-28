import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENT_KEYS,
  PASSWORD_SYMBOLS,
  evaluatePassword,
} from '../src/password-policy';

describe('evaluatePassword', () => {
  it.each([
    ['length', 'Aa1!short', 'length'],
    ['lowercase letter', 'UPPERCASE123!', 'lowercase'],
    ['uppercase letter', 'lowercase123!', 'uppercase'],
    ['number', 'NoNumbersHere!', 'number'],
    ['symbol', 'NoSymbolsHere123', 'symbol'],
  ] as const)('identifies a missing %s requirement', (_case, password, missingRequirement) => {
    const result = evaluatePassword(password);

    expect(result.requirements[missingRequirement]).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it.each([
    [PASSWORD_MIN_LENGTH - 1, false],
    [PASSWORD_MIN_LENGTH, true],
    [PASSWORD_MAX_LENGTH, true],
    [PASSWORD_MAX_LENGTH + 1, false],
  ])('treats a %i-character password as length %s', (length, isSatisfied) => {
    const password = 'Aa1!'.padEnd(length, 'x');

    expect(password).toHaveLength(length);
    expect(evaluatePassword(password).requirements.length).toBe(isSatisfied);
    expect(evaluatePassword(password).isValid).toBe(isSatisfied);
  });

  it.each(Array.from(PASSWORD_SYMBOLS))('counts %j as a symbol', (symbol) => {
    expect(evaluatePassword(`Password1234${symbol}`).requirements.symbol).toBe(true);
  });

  it.each([
    ['a Thai character', 'Password1234ก'],
    ['a space', 'Password1234 '],
    ['an accented letter', 'Password1234é'],
  ])('does not count %s as a symbol', (_case, password) => {
    expect(evaluatePassword(password).requirements.symbol).toBe(false);
  });

  it('counts only ASCII letters and digits', () => {
    expect(evaluatePassword('ÉÀÜ éàü ١٢٣ ๑๒๓ !!').requirements).toEqual({
      length: true,
      lowercase: false,
      number: false,
      symbol: true,
      uppercase: false,
    });
  });

  it.each([
    ['', 0, 'weak'],
    ['a', 20, 'weak'],
    ['aA', 40, 'fair'],
    ['aA1', 60, 'good'],
    ['aA1!', 80, 'good'],
    ['StrongPassword1!', 100, 'strong'],
  ] as const)('scores %j at %i%% as %s', (password, percentage, strength) => {
    expect(evaluatePassword(password)).toMatchObject({ percentage, strength });
  });

  it('reports full strength only when every requirement passes', () => {
    expect(evaluatePassword('StrongPassword1!')).toEqual({
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

  it('exposes every requirement in display order', () => {
    expect(PASSWORD_REQUIREMENT_KEYS).toEqual([
      'length',
      'lowercase',
      'uppercase',
      'number',
      'symbol',
    ]);
  });
});
