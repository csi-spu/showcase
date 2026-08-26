'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import {
  AdminNotificationsCoreClient,
  AdminNotificationsCoreError,
} from '@/lib/admin-notifications-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';

export async function markAdminNotificationReadAction(publicId: string): Promise<void> {
  const parsed = z.uuid().safeParse(publicId);
  if (!parsed.success) return;
  await run((client, session) => client.markRead(session, parsed.data));
}

export async function markAllAdminNotificationsReadAction(): Promise<void> {
  await run((client, session) => client.markAllRead(session));
}

async function run(
  operation: (client: AdminNotificationsCoreClient, sessionToken: string) => Promise<unknown>,
): Promise<void> {
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  try {
    await operation(new AdminNotificationsCoreClient(getAdminServerEnvironment()), sessionToken);
  } catch (error: unknown) {
    if (
      error instanceof AdminNotificationsCoreError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      await clearAdminSessionToken();
      redirect('/?expired=1');
    }
    throw error;
  }
  revalidatePath('/notifications');
}
