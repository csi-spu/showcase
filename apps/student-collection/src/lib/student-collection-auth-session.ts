import 'server-only';
import { cookies } from 'next/headers';
import {
  expiredStudentCollectionSessionCookie,
  studentCollectionSessionCookie,
} from './student-collection-session-cookie';

export async function readStudentCollectionSessionToken(): Promise<string | null> {
  const { name } = studentCollectionSessionCookie(process.env.NODE_ENV);
  return (await cookies()).get(name)?.value ?? null;
}

export async function setStudentCollectionSessionToken(sessionToken: string): Promise<void> {
  const { name, options } = studentCollectionSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, sessionToken, options);
}

export async function clearStudentCollectionSessionToken(): Promise<void> {
  const { name, options, value } = expiredStudentCollectionSessionCookie(process.env.NODE_ENV);
  (await cookies()).set(name, value, options);
}
