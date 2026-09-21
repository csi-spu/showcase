import 'server-only';
import { cookies } from 'next/headers';
import { expiredInstructorSessionCookie, instructorSessionCookie } from './instructor-session-cookie';

export async function readInstructorSessionToken(): Promise<string | null> {
  const { name } = instructorSessionCookie(process.env.NODE_ENV);
  return (await cookies()).get(name)?.value ?? null;
}

export async function setInstructorSessionToken(sessionToken: string): Promise<void> {
  const { name, options } = instructorSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, sessionToken, options);
}

export async function clearInstructorSessionToken(): Promise<void> {
  const { name, options, value } = expiredInstructorSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, value, options);
}
