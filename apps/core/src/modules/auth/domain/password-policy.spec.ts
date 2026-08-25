import { evaluatePasswordChange } from './password-policy';

describe('evaluatePasswordChange', () => {
  const currentPassword = 'temporary-passphrase';

  it.each([
    ['shorter than 12 characters', 'short', false, 'PASSWORD_TOO_SHORT'],
    ['longer than 128 characters', 'x'.repeat(129), false, 'PASSWORD_TOO_LONG'],
    ['the current password', currentPassword, false, 'PASSWORD_UNCHANGED'],
    ['the Student ID', '69000001', true, 'PASSWORD_MATCHES_STUDENT_ID'],
  ])('rejects a password %s', (_case, newPassword, isStudentId, errorCode) => {
    expect(evaluatePasswordChange({ currentPassword, isStudentId, newPassword })).toEqual({
      errorCode,
      isValid: false,
    });
  });

  it.each(['x'.repeat(12), 'x'.repeat(128), 'correct horse battery staple', '            '])(
    'accepts an in-range passphrase without composition or normalization: %j',
    (newPassword) => {
      expect(evaluatePasswordChange({ currentPassword, isStudentId: false, newPassword })).toEqual({
        isValid: true,
      });
    },
  );
});
