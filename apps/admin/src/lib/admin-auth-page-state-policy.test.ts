import { CoreClientError } from '@showcase/core-client';
import { describe, expect, it, vi } from 'vitest';
import { resolveAdminAuthPageState } from './admin-auth-page-state-policy';

describe('resolveAdminAuthPageState', () => {
  it('does not call Core for forced-expired or absent-cookie states', async () => {
    const getSession = vi.fn();
    await expect(
      resolveAdminAuthPageState({ getSession, isForcedExpired: true, sessionToken: null }),
    ).resolves.toEqual({ kind: 'expired' });
    await expect(
      resolveAdminAuthPageState({ getSession, isForcedExpired: false, sessionToken: null }),
    ).resolves.toEqual({ kind: 'login', isServiceUnavailable: false });
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each(['active', 'password_change_required'] as const)(
    'returns the current %s state',
    async (sessionState) => {
      await expect(
        resolveAdminAuthPageState({
          getSession: vi.fn().mockResolvedValue({ sessionState }),
          isForcedExpired: false,
          sessionToken: 'opaque-admin-session',
        }),
      ).resolves.toEqual({ kind: sessionState, session: { sessionState } });
    },
  );

  it.each(['SESSION_EXPIRED', 'UNAUTHENTICATED'])('maps %s to expired', async (code) => {
    await expect(
      resolveAdminAuthPageState({
        getSession: vi.fn().mockRejectedValue(new CoreClientError(code, 401)),
        isForcedExpired: false,
        sessionToken: 'opaque-admin-session',
      }),
    ).resolves.toEqual({ kind: 'expired' });
  });

  it('maps transport and malformed-response failures to unavailable login', async () => {
    await expect(
      resolveAdminAuthPageState({
        getSession: vi.fn().mockRejectedValue(new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503)),
        isForcedExpired: false,
        sessionToken: 'opaque-admin-session',
      }),
    ).resolves.toEqual({ kind: 'login', isServiceUnavailable: true });
  });
});
