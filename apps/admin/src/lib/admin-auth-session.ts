import 'server-only';
import { cookies } from 'next/headers';
import { adminSessionCookie, expiredAdminSessionCookie } from './admin-session-cookie';

export async function readAdminSessionToken(): Promise<string | null> {
  const { name } = adminSessionCookie(process.env.NODE_ENV);
  return (await cookies()).get(name)?.value ?? null;
}

export async function setAdminSessionToken(sessionToken: string): Promise<void> {
  const { name, options } = adminSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, sessionToken, options);
}

export async function clearAdminSessionToken(): Promise<void> {
  const { name, options, value } = expiredAdminSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, value, options);
}
