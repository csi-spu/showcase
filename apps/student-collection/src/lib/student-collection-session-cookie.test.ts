import { describe, expect, it } from 'vitest';
import {
  expiredStudentCollectionSessionCookie,
  studentCollectionSessionCookie,
} from './student-collection-session-cookie';

describe('studentCollectionSessionCookie', () => {
  it('uses a host-only cookie name and secure attributes in production', () => {
    const cookie = studentCollectionSessionCookie('production');
    expect(cookie.name).toBe('__Host-showcase_student_collection_session');
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true });
  });

  it('uses a plain cookie name outside production', () => {
    const cookie = studentCollectionSessionCookie('development');
    expect(cookie.name).toBe('showcase_student_collection_session');
    expect(cookie.options.secure).toBe(false);
  });

  it('expires the same cookie name with maxAge zero', () => {
    const expired = expiredStudentCollectionSessionCookie('production');
    expect(expired.name).toBe('__Host-showcase_student_collection_session');
    expect(expired.options.maxAge).toBe(0);
    expect(expired.value).toBe('');
  });
});
