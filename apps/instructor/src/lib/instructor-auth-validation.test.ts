import { describe, expect, it } from 'vitest';
import { validateLogin, validatePasswordChange } from './instructor-auth-validation';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('validateLogin', () => {
  it('normalizes the instructor login and accepts a valid submission', () => {
    expect(
      validateLogin(formData({ instructorLogin: '  Teaching.Staff  ', password: 'x' })),
    ).toEqual({ instructorLogin: 'teaching.staff', password: 'x' });
  });

  it('rejects a malformed login without leaking which field failed', () => {
    expect(validateLogin(formData({ instructorLogin: 'ab', password: 'x' }))).toBe('credentials');
    expect(validateLogin(formData({ instructorLogin: 'ok', password: '' }))).toBe('credentials');
  });
});

describe('validatePasswordChange', () => {
  const base = {
    currentPassword: 'temporary-password-value',
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
