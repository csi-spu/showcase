import { describe, expect, it } from 'vitest';
import { validatePasswordChange } from './student-auth-validation';

describe('validatePasswordChange', () => {
  it('preserves chosen-password whitespace and rejects mismatch', () => {
    const preservedInput = new FormData();
    preservedInput.set('confirmPassword', '  correct horse battery staple  ');
    preservedInput.set('currentPassword', 'initial-password');
    preservedInput.set('newPassword', '  correct horse battery staple  ');
    const preserved = validatePasswordChange(preservedInput);
    expect(preserved).toEqual({
      currentPassword: 'initial-password',
      newPassword: '  correct horse battery staple  ',
    });

    const mismatch = new FormData();
    mismatch.set('currentPassword', 'initial-password');
    mismatch.set('newPassword', 'correct horse battery staple');
    mismatch.set('confirmPassword', 'different password value');
    expect(validatePasswordChange(mismatch)).toBe('passwordMismatch');
  });
});
