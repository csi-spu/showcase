import 'server-only';
import { getStudentServerEnvironment } from './server-environment';
import {
  StudentAuthCoreClient,
  StudentAuthCoreError,
  type StudentSessionStatus,
} from './student-auth-core';
import { readStudentSessionToken } from './student-auth-session';

export type StudentAuthPageState =
  | { kind: 'active'; session: StudentSessionStatus }
  | { kind: 'expired' }
  | { kind: 'login'; isServiceUnavailable: boolean }
  | { kind: 'password_change_required'; session: StudentSessionStatus };

export async function getStudentAuthPageState(
  isForcedExpired = false,
): Promise<StudentAuthPageState> {
  if (isForcedExpired) {
    return { kind: 'expired' };
  }
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) {
    return { kind: 'login', isServiceUnavailable: false };
  }

  try {
    const session = await new StudentAuthCoreClient(getStudentServerEnvironment()).getSession(
      sessionToken,
    );
    return { kind: session.sessionState, session };
  } catch (error: unknown) {
    if (
      error instanceof StudentAuthCoreError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      return { kind: 'expired' };
    }
    return { kind: 'login', isServiceUnavailable: true };
  }
}
