import 'server-only';
import { cookies } from 'next/headers';
import { expiredStudentSessionCookie, studentSessionCookie } from './student-session-cookie';

export async function readStudentSessionToken(): Promise<string | null> {
  const { name } = studentSessionCookie(process.env.NODE_ENV);
  return (await cookies()).get(name)?.value ?? null;
}

export async function setStudentSessionToken(sessionToken: string): Promise<void> {
  const { name, options } = studentSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, sessionToken, options);
}

export async function clearStudentSessionToken(): Promise<void> {
  const { name, options, value } = expiredStudentSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, value, options);
}
