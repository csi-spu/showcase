import { describe, expect, it } from 'vitest';
import { validateLogin, validatePasswordChange } from './admin-auth-validation';

describe('Admin authentication validation', () => {
  it('normalizes a private Admin login and rejects invalid identifiers', () => {
    const valid = new FormData();
    valid.set('adminLogin', '  Operations.Team  ');
    valid.set('password', 'temporary-password-value');
    expect(validateLogin(valid)).toEqual({
      adminLogin: 'operations.team',
      password: 'temporary-password-value',
    });

    const invalid = new FormData();
    invalid.set('adminLogin', 'contains spaces');
    invalid.set('password', 'temporary-password-value');
    expect(validateLogin(invalid)).toBe('credentials');
  });

  it('preserves password whitespace and rejects mismatch or unchanged values', () => {
    const valid = new FormData();
    valid.set('confirmPassword', '  correct horse battery staple  ');
    valid.set('currentPassword', 'temporary-password-value');
    valid.set('newPassword', '  correct horse battery staple  ');
    expect(validatePasswordChange(valid)).toEqual({
      currentPassword: 'temporary-password-value',
      newPassword: '  correct horse battery staple  ',
    });

    const unchanged = new FormData();
    unchanged.set('confirmPassword', 'temporary-password-value');
    unchanged.set('currentPassword', 'temporary-password-value');
    unchanged.set('newPassword', 'temporary-password-value');
    expect(validatePasswordChange(unchanged)).toBe('passwordPolicy');

    const mismatch = new FormData();
    mismatch.set('confirmPassword', 'different password value');
    mismatch.set('currentPassword', 'temporary-password-value');
    mismatch.set('newPassword', 'correct horse battery staple');
    expect(validatePasswordChange(mismatch)).toBe('passwordMismatch');
  });
});
