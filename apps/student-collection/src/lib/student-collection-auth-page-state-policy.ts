import { CoreClientError } from '@showcase/core-client';
import type { StudentCollectionSessionStatus } from './student-collection-auth-core';

export type StudentCollectionAuthPageState =
  | { kind: 'active'; session: StudentCollectionSessionStatus }
  | { kind: 'expired' }
  | { kind: 'login'; isServiceUnavailable: boolean }
  | { kind: 'password_change_required'; session: StudentCollectionSessionStatus };

export async function resolveStudentCollectionAuthPageState(input: {
  getSession: (sessionToken: string) => Promise<StudentCollectionSessionStatus>;
  isForcedExpired: boolean;
  sessionToken: string | null;
}): Promise<StudentCollectionAuthPageState> {
  if (input.isForcedExpired) {
    return { kind: 'expired' };
  }
  if (input.sessionToken === null) {
    return { kind: 'login', isServiceUnavailable: false };
  }
  try {
    const session = await input.getSession(input.sessionToken);
    return { kind: session.sessionState, session };
  } catch (error: unknown) {
    if (
      error instanceof CoreClientError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      return { kind: 'expired' };
    }
    return { kind: 'login', isServiceUnavailable: true };
  }
}
