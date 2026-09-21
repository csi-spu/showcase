import { describe, expect, it } from 'vitest';
import { expiredInstructorSessionCookie, instructorSessionCookie } from './instructor-session-cookie';

describe('instructorSessionCookie', () => {
  it('uses a host-only cookie name and secure attributes in production', () => {
    const cookie = instructorSessionCookie('production');
    expect(cookie.name).toBe('__Host-showcase_instructor_session');
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true });
  });

  it('uses a plain cookie name outside production', () => {
    const cookie = instructorSessionCookie('development');
    expect(cookie.name).toBe('showcase_instructor_session');
    expect(cookie.options.secure).toBe(false);
  });

  it('expires the same cookie name with maxAge zero', () => {
    const expired = expiredInstructorSessionCookie('production');
    expect(expired.name).toBe('__Host-showcase_instructor_session');
    expect(expired.options.maxAge).toBe(0);
    expect(expired.value).toBe('');
  });
});
