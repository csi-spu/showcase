import 'server-only';
import { getAdminServerEnvironment } from './server-environment';
import { AdminAuthCoreClient } from './admin-auth-core';
import { resolveAdminAuthPageState, type AdminAuthPageState } from './admin-auth-page-state-policy';
import { readAdminSessionToken } from './admin-auth-session';

export async function getAdminAuthPageState(isForcedExpired = false): Promise<AdminAuthPageState> {
  if (isForcedExpired) {
    return { kind: 'expired' };
  }
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) {
    return { kind: 'login', isServiceUnavailable: false };
  }
  const client = new AdminAuthCoreClient(getAdminServerEnvironment());
  return resolveAdminAuthPageState({
    getSession: (token) => client.getSession(token),
    isForcedExpired,
    sessionToken,
  });
}
