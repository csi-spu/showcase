import 'server-only';
import { getStudentCollectionServerEnvironment } from './server-environment';
import { StudentCollectionAuthCoreClient } from './student-collection-auth-core';
import {
  resolveStudentCollectionAuthPageState,
  type StudentCollectionAuthPageState,
} from './student-collection-auth-page-state-policy';
import { readStudentCollectionSessionToken } from './student-collection-auth-session';

export async function getStudentCollectionAuthPageState(
  isForcedExpired = false,
): Promise<StudentCollectionAuthPageState> {
  if (isForcedExpired) {
    return { kind: 'expired' };
  }
  const sessionToken = await readStudentCollectionSessionToken();
  if (sessionToken === null) {
    return { kind: 'login', isServiceUnavailable: false };
  }
  const client = new StudentCollectionAuthCoreClient(getStudentCollectionServerEnvironment());
  return resolveStudentCollectionAuthPageState({
    getSession: (token) => client.getSession(token),
    isForcedExpired,
    sessionToken,
  });
}
