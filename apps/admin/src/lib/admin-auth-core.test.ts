import { describe, expect, it, vi } from 'vitest';
import { AdminAuthCoreClient } from './admin-auth-core';

const config = {
  adminBffSecret: 'test-admin-bff-secret-that-is-long-enough',
  coreUrl: 'https://core.example.test',
};

describe('AdminAuthCoreClient', () => {
  it('uses shared server transport for Admin login and validates its response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sessionState: 'password_change_required',
        sessionToken: 'opaque-admin-session',
      }),
    );
    const client = new AdminAuthCoreClient(config, fetchMock);

    await expect(
      client.login({
        adminLogin: 'operations',
        password: 'temporary-password-value',
        sourceAddress: '192.0.2.30',
      }),
    ).resolves.toEqual({
      sessionState: 'password_change_required',
      sessionToken: 'opaque-admin-session',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/v1/internal/admin/auth/login',
      expect.objectContaining({
        body: JSON.stringify({
          adminLogin: 'operations',
          password: 'temporary-password-value',
        }),
        credentials: 'omit',
        headers: expect.any(Headers),
      }),
    );
    const loginHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(loginHeaders.get('x-admin-bff-secret')).toBe(config.adminBffSecret);
    expect(loginHeaders.get('x-client-address')).toBe('192.0.2.30');
  });

  it('sends opaque Admin session as bearer and rejects malformed success responses', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ sessionState: 'active' }))
      .mockResolvedValueOnce(Response.json({ sessionState: 'student' }));
    const client = new AdminAuthCoreClient(config, fetchMock);

    await expect(client.getSession('opaque-admin-session')).resolves.toEqual({
      sessionState: 'active',
    });
    const sessionHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(sessionHeaders.get('authorization')).toBe('Bearer opaque-admin-session');
    await expect(client.getSession('opaque-admin-session')).rejects.toMatchObject({
      code: 'AUTH_SERVICE_UNAVAILABLE',
      status: 503,
    });
  });
});
