const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function studentSessionCookie(nodeEnvironment: string | undefined) {
  const isSecure = nodeEnvironment === 'production';
  return {
    name: isSecure ? '__Host-showcase_student_session' : 'showcase_student_session',
    options: {
      httpOnly: true as const,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/' as const,
      sameSite: 'lax' as const,
      secure: isSecure,
    },
  };
}

export function expiredStudentSessionCookie(nodeEnvironment: string | undefined) {
  const cookie = studentSessionCookie(nodeEnvironment);
  return {
    name: cookie.name,
    options: { ...cookie.options, maxAge: 0 },
    value: '',
  };
}
