import 'server-only';
import { z } from 'zod';
import { AdminRosterCoreClient, type AdminRosterBatch } from './admin-roster-core';
import { readAdminSessionToken } from './admin-auth-session';
import { getAdminServerEnvironment } from './server-environment';

export async function getAdminRosterBatch(batchId: string): Promise<AdminRosterBatch | null> {
  if (!z.uuid().safeParse(batchId).success) return null;
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) return null;
  try {
    return await new AdminRosterCoreClient(getAdminServerEnvironment()).getBatch(
      sessionToken,
      batchId,
    );
  } catch {
    return null;
  }
}
