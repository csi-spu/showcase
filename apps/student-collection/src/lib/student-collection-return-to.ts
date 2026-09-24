/**
 * Where a deeplink guard sends an unauthenticated Student back to once they
 * sign in. The value crosses a trust boundary (it round-trips through a URL
 * query string), so it is validated on every read rather than trusted as-is:
 * only a same-app relative path is ever accepted, which rules out an open
 * redirect to an arbitrary origin.
 */
export function parseStudentCollectionReturnTo(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;

  try {
    const appOrigin = new URL('https://student-collection.invalid');
    const destination = new URL(value, appOrigin);
    return destination.origin === appOrigin.origin ? value : null;
  } catch {
    return null;
  }
}
