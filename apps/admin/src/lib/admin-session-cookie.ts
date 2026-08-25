const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function adminSessionCookie(nodeEnvironment: string | undefined) {
  const isSecure = nodeEnvironment === 'production';
  return {
    name: isSecure ? '__Host-showcase_admin_session' : 'showcase_admin_session',
    options: {
      httpOnly: true as const,
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      path: '/' as const,
      sameSite: 'lax' as const,
      secure: isSecure,
    },
  };
}

export function expiredAdminSessionCookie(nodeEnvironment: string | undefined) {
  const cookie = adminSessionCookie(nodeEnvironment);
  return {
    name: cookie.name,
    options: { ...cookie.options, maxAge: 0 },
    value: '',
  };
}
