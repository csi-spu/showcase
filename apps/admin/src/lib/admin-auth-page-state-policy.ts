import { CoreClientError } from '@showcase/core-client';
import type { AdminSessionStatus } from './admin-auth-core';

export type AdminAuthPageState =
  | { kind: 'active'; session: AdminSessionStatus }
  | { kind: 'expired' }
  | { kind: 'login'; isServiceUnavailable: boolean }
  | { kind: 'password_change_required'; session: AdminSessionStatus };

export async function resolveAdminAuthPageState(input: {
  getSession: (sessionToken: string) => Promise<AdminSessionStatus>;
  isForcedExpired: boolean;
  sessionToken: string | null;
}): Promise<AdminAuthPageState> {
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
