import { describe, expect, it } from 'vitest';
import { adminSessionCookie, expiredAdminSessionCookie } from './admin-session-cookie';

describe('adminSessionCookie', () => {
  it('uses a distinct Secure, HttpOnly, host-only cookie for eight hours', () => {
    expect(adminSessionCookie('production')).toEqual({
      name: '__Host-showcase_admin_session',
      options: {
        httpOnly: true,
        maxAge: 28_800,
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
    });
    expect(adminSessionCookie('production').options).not.toHaveProperty('domain');
    expect(adminSessionCookie('production').name).not.toContain('student');
  });

  it('retains host-only requirements while expiring the Admin cookie', () => {
    expect(expiredAdminSessionCookie('production')).toEqual({
      name: '__Host-showcase_admin_session',
      options: expect.objectContaining({ maxAge: 0, path: '/', secure: true }),
      value: '',
    });
  });
});
