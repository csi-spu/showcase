import { describe, expect, it } from 'vitest';
import { validatePasswordChange } from './student-auth-validation';

describe('validatePasswordChange', () => {
  it('preserves chosen-password whitespace and rejects mismatch', () => {
    const preservedInput = new FormData();
    preservedInput.set('confirmPassword', '  Strong Password Value1!  ');
    preservedInput.set('currentPassword', 'initial-password');
    preservedInput.set('newPassword', '  Strong Password Value1!  ');
    const preserved = validatePasswordChange(preservedInput);
    expect(preserved).toEqual({
      currentPassword: 'initial-password',
      newPassword: '  Strong Password Value1!  ',
    });

    const mismatch = new FormData();
    mismatch.set('currentPassword', 'initial-password');
    mismatch.set('newPassword', 'Strong Password Value1!');
    mismatch.set('confirmPassword', 'Different Password Value2!');
    expect(validatePasswordChange(mismatch)).toBe('passwordMismatch');
  });

  it('rejects a password that bypasses the client without required character groups', () => {
    const weakPassword = new FormData();
    weakPassword.set('currentPassword', 'initial-password');
    weakPassword.set('newPassword', 'alllowercasepassword');
    weakPassword.set('confirmPassword', 'alllowercasepassword');

    expect(validatePasswordChange(weakPassword)).toBe('passwordPolicy');
  });
});
