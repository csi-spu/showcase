const INSTRUCTOR_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function instructorSessionCookie(nodeEnvironment: string | undefined) {
  const isSecure = nodeEnvironment === 'production';
  return {
    name: isSecure ? '__Host-showcase_instructor_session' : 'showcase_instructor_session',
    options: {
      httpOnly: true as const,
      maxAge: INSTRUCTOR_SESSION_MAX_AGE_SECONDS,
      path: '/' as const,
      sameSite: 'lax' as const,
      secure: isSecure,
    },
  };
}

export function expiredInstructorSessionCookie(nodeEnvironment: string | undefined) {
  const cookie = instructorSessionCookie(nodeEnvironment);
  return {
    name: cookie.name,
    options: { ...cookie.options, maxAge: 0 },
    value: '',
  };
}
