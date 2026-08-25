import 'server-only';
import type { AcademicYearSettingsState } from '@/app/account-controls-state';
import { AdminAccountControlsCoreClient } from './admin-account-controls-core';
import { readAdminSessionToken } from './admin-auth-session';
import { getAdminServerEnvironment } from './server-environment';

export async function getAdminAcademicYear(): Promise<AcademicYearSettingsState | null> {
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) return null;
  try {
    return await new AdminAccountControlsCoreClient(getAdminServerEnvironment()).getAcademicYear(
      sessionToken,
    );
  } catch {
    return null;
  }
}
