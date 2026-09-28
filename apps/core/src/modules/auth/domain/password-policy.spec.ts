import { evaluatePasswordChange } from './password-policy';

describe('evaluatePasswordChange', () => {
  const currentPassword = 'Temporary-Passphrase1';

  it.each([
    ['shorter than 12 characters', 'Short1!', false, 'PASSWORD_TOO_SHORT'],
    ['longer than 128 characters', 'Aa1!'.padEnd(129, 'x'), false, 'PASSWORD_TOO_LONG'],
    ['the current password', currentPassword, false, 'PASSWORD_UNCHANGED'],
    ['the Student ID', '69000001', true, 'PASSWORD_MATCHES_STUDENT_ID'],
    ['without a lowercase letter', 'CORRECT HORSE 1!', false, 'PASSWORD_MISSING_CHARACTER_CLASS'],
    ['without an uppercase letter', 'correct horse 1!', false, 'PASSWORD_MISSING_CHARACTER_CLASS'],
    ['without a digit', 'Correct horse !!', false, 'PASSWORD_MISSING_CHARACTER_CLASS'],
    ['without a symbol', 'Correct horse 12', false, 'PASSWORD_MISSING_CHARACTER_CLASS'],
    ['with only non-ASCII letters', 'ÉÀÜ éàü ๑๒๓ !!', false, 'PASSWORD_MISSING_CHARACTER_CLASS'],
  ])('rejects a password %s', (_case, newPassword, isStudentId, errorCode) => {
    expect(evaluatePasswordChange({ currentPassword, isStudentId, newPassword })).toEqual({
      errorCode,
      isValid: false,
    });
  });

  it.each([
    'Aa1!'.padEnd(12, 'x'),
    'Aa1!'.padEnd(128, 'x'),
    'Correct horse battery 1!',
    ' Aa1!        ',
  ])(
    'accepts an in-range password with every character class and no normalization: %j',
    (newPassword) => {
      expect(evaluatePasswordChange({ currentPassword, isStudentId: false, newPassword })).toEqual({
        isValid: true,
      });
    },
  );
});
