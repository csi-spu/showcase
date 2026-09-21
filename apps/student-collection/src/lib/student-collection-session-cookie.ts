const STUDENT_COLLECTION_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function studentCollectionSessionCookie(nodeEnvironment: string | undefined) {
  const isSecure = nodeEnvironment === 'production';
  return {
    name: isSecure
      ? '__Host-showcase_student_collection_session'
      : 'showcase_student_collection_session',
    options: {
      httpOnly: true as const,
      maxAge: STUDENT_COLLECTION_SESSION_MAX_AGE_SECONDS,
      path: '/' as const,
      sameSite: 'lax' as const,
      secure: isSecure,
    },
  };
}

export function expiredStudentCollectionSessionCookie(nodeEnvironment: string | undefined) {
  const cookie = studentCollectionSessionCookie(nodeEnvironment);
  return {
    name: cookie.name,
    options: { ...cookie.options, maxAge: 0 },
    value: '',
  };
}
