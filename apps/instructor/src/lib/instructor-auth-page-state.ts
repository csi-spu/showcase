import 'server-only';
import { getInstructorServerEnvironment } from './server-environment';
import { InstructorAuthCoreClient } from './instructor-auth-core';
import {
  resolveInstructorAuthPageState,
  type InstructorAuthPageState,
} from './instructor-auth-page-state-policy';
import { readInstructorSessionToken } from './instructor-auth-session';

export async function getInstructorAuthPageState(
  isForcedExpired = false,
): Promise<InstructorAuthPageState> {
  if (isForcedExpired) {
    return { kind: 'expired' };
  }
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) {
    return { kind: 'login', isServiceUnavailable: false };
  }
  const client = new InstructorAuthCoreClient(getInstructorServerEnvironment());
  return resolveInstructorAuthPageState({
    getSession: (token) => client.getSession(token),
    isForcedExpired,
    sessionToken,
  });
}
