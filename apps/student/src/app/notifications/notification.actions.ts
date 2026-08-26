'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { clearStudentSessionToken, readStudentSessionToken } from '@/lib/student-auth-session';
import {
  StudentNotificationsCoreClient,
  StudentNotificationsCoreError,
} from '@/lib/student-notifications-core';

export async function markStudentNotificationReadAction(publicId: string): Promise<void> {
  const parsed = z.uuid().safeParse(publicId);
  if (!parsed.success) return;
  await run((client, session) => client.markRead(session, parsed.data));
}

export async function markAllStudentNotificationsReadAction(): Promise<void> {
  await run((client, session) => client.markAllRead(session));
}

async function run(
  operation: (client: StudentNotificationsCoreClient, sessionToken: string) => Promise<unknown>,
): Promise<void> {
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  try {
    await operation(
      new StudentNotificationsCoreClient(getStudentServerEnvironment()),
      sessionToken,
    );
  } catch (error: unknown) {
    if (
      error instanceof StudentNotificationsCoreError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      await clearStudentSessionToken();
      redirect('/?expired=1');
    }
    throw error;
  }
  revalidatePath('/notifications');
}
