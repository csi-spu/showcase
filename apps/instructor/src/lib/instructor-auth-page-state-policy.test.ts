import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it } from 'vitest';
import { resolveInstructorAuthPageState } from './instructor-auth-page-state-policy';

describe('resolveInstructorAuthPageState', () => {
  it('forces expired regardless of an existing session token', async () => {
    await expect(
      resolveInstructorAuthPageState({
        getSession: () => Promise.resolve({ sessionState: 'active' }),
        isForcedExpired: true,
        sessionToken: 'token',
      }),
    ).resolves.toEqual({ kind: 'expired' });
  });

  it('shows the login form when there is no session token', async () => {
    await expect(
      resolveInstructorAuthPageState({
        getSession: () => Promise.reject(new Error('should not be called')),
        isForcedExpired: false,
        sessionToken: null,
      }),
    ).resolves.toEqual({ kind: 'login', isServiceUnavailable: false });
  });

  it('reflects the session state Core returns for a valid token', async () => {
    await expect(
      resolveInstructorAuthPageState({
        getSession: () => Promise.resolve({ sessionState: 'password_change_required' }),
        isForcedExpired: false,
        sessionToken: 'token',
      }),
    ).resolves.toEqual({
      kind: 'password_change_required',
      session: { sessionState: 'password_change_required' },
    });
  });

  it('treats an expired/unauthenticated session lookup as expired, not a login failure', async () => {
    await expect(
      resolveInstructorAuthPageState({
        getSession: () => Promise.reject(new CoreClientError('SESSION_EXPIRED', 401)),
        isForcedExpired: false,
        sessionToken: 'token',
      }),
    ).resolves.toEqual({ kind: 'expired' });
  });

  it('falls back to a service-unavailable login state for other failures', async () => {
    await expect(
      resolveInstructorAuthPageState({
        getSession: () => Promise.reject(new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503)),
        isForcedExpired: false,
        sessionToken: 'token',
      }),
    ).resolves.toEqual({ kind: 'login', isServiceUnavailable: true });
  });
});
