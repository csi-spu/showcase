import { CoreClientError } from '@showcase/core-client';
import type { InstructorSessionStatus } from './instructor-auth-core';

export type InstructorAuthPageState =
  | { kind: 'active'; session: InstructorSessionStatus }
  | { kind: 'expired' }
  | { kind: 'login'; isServiceUnavailable: boolean }
  | { kind: 'password_change_required'; session: InstructorSessionStatus };

export async function resolveInstructorAuthPageState(input: {
  getSession: (sessionToken: string) => Promise<InstructorSessionStatus>;
  isForcedExpired: boolean;
  sessionToken: string | null;
}): Promise<InstructorAuthPageState> {
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
