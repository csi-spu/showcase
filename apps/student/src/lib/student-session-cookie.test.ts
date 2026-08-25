import { describe, expect, it } from 'vitest';
import { expiredStudentSessionCookie, studentSessionCookie } from './student-session-cookie';

describe('studentSessionCookie', () => {
  it('uses a Secure, HttpOnly, host-only cookie in shared environments', () => {
    const cookie = studentSessionCookie('production');

    expect(cookie).toEqual({
      name: '__Host-showcase_student_session',
      options: {
        httpOnly: true,
        maxAge: 604_800,
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
    });
    expect(cookie.options).not.toHaveProperty('domain');
  });

  it('retains __Host cookie requirements while expiring the session', () => {
    expect(expiredStudentSessionCookie('production')).toEqual({
      name: '__Host-showcase_student_session',
      options: expect.objectContaining({ maxAge: 0, path: '/', secure: true }),
      value: '',
    });
  });
});
