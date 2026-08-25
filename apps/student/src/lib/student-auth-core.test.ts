import { describe, expect, it, vi } from 'vitest';
import { StudentAuthCoreClient } from './student-auth-core';

const config = {
  coreUrl: 'https://core.example.test',
  studentBffSecret: 'test-student-bff-secret-that-is-long-enough',
};

describe('StudentAuthCoreClient', () => {
  it('keeps BFF and session credentials on the server-to-server request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        canUseStudentCapabilities: false,
        sessionState: 'password_change_required',
        sessionToken: 'opaque-session-token',
      }),
    );
    const client = new StudentAuthCoreClient(config, fetchMock);

    await expect(
      client.login({
        password: 'initial-password',
        sourceAddress: '192.0.2.10',
        studentId: '69000001',
      }),
    ).resolves.toMatchObject({ sessionToken: 'opaque-session-token' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/v1/internal/student/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ password: 'initial-password', studentId: '69000001' }),
        cache: 'no-store',
        credentials: 'omit',
        headers: expect.any(Headers),
        method: 'POST',
      }),
    );
    const loginHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(loginHeaders.get('x-client-address')).toBe('192.0.2.10');
    expect(loginHeaders.get('x-student-bff-secret')).toBe(config.studentBffSecret);
    expect(fetchMock.mock.calls[0]?.[1]).toHaveProperty('credentials', 'omit');
  });

  it('sends the opaque session as bearer and rejects malformed Core responses', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ canUseStudentCapabilities: true, sessionState: 'active' }),
      )
      .mockResolvedValueOnce(Response.json({ unexpected: true }));
    const client = new StudentAuthCoreClient(config, fetchMock);

    await expect(client.getSession('opaque-session-token')).resolves.toEqual({
      canUseStudentCapabilities: true,
      sessionState: 'active',
    });
    const sessionHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(sessionHeaders.get('authorization')).toBe('Bearer opaque-session-token');
    await expect(client.getSession('opaque-session-token')).rejects.toMatchObject({
      code: 'AUTH_SERVICE_UNAVAILABLE',
    });
  });
});
