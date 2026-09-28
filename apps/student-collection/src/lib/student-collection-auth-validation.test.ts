import { describe, expect, it } from 'vitest';
import { validateLogin, validatePasswordChange } from './student-collection-auth-validation';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('validateLogin', () => {
  it('accepts a valid 8-digit Student ID and password', () => {
    expect(validateLogin(formData({ password: 'x', studentId: '69000001' }))).toEqual({
      password: 'x',
      studentId: '69000001',
    });
  });

  it('rejects a malformed Student ID or empty password without leaking which field failed', () => {
    expect(validateLogin(formData({ password: 'x', studentId: '123' }))).toBe('credentials');
    expect(validateLogin(formData({ password: '', studentId: '69000001' }))).toBe('credentials');
  });
});

describe('validatePasswordChange', () => {
  const base = {
    currentPassword: '69000001',
    newPassword: 'Correct horse battery 1!',
  };

  it('accepts a valid change with a matching confirmation', () => {
    expect(
      validatePasswordChange(formData({ ...base, confirmPassword: base.newPassword })),
    ).toEqual(base);
  });

  it('rejects a new password identical to the current one', () => {
    expect(
      validatePasswordChange(
        formData({
          confirmPassword: base.currentPassword,
          currentPassword: base.currentPassword,
          newPassword: base.currentPassword,
        }),
      ),
    ).toBe('passwordPolicy');
  });

  it('rejects a confirmation that does not match the new password', () => {
    expect(
      validatePasswordChange(formData({ ...base, confirmPassword: 'something else entirely' })),
    ).toBe('passwordMismatch');
  });

  it('rejects a new password missing a required character class', () => {
    expect(
      validatePasswordChange(
        formData({
          ...base,
          confirmPassword: 'correct horse battery staple',
          newPassword: 'correct horse battery staple',
        }),
      ),
    ).toBe('passwordPolicy');
  });
});
