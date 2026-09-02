/* eslint-disable @typescript-eslint/unbound-method */
import type { PrismaClient } from '../../../../generated/prisma-client';
import { BetterAuthEngine } from './better-auth.adapter';

const USER_ID = '40000000-0000-4000-8000-000000000001';

describe('BetterAuthEngine', () => {
  function createEngine() {
    let cleanupQuery = '';
    let cleanupExpiresBefore: Date | null = null;
    const executeRaw = (query: TemplateStringsArray, expiresBefore: Date): Promise<number> => {
      cleanupQuery = query.join('?');
      cleanupExpiresBefore = expiresBefore;
      return Promise.resolve(0);
    };
    const engine = new BetterAuthEngine({ $executeRaw: executeRaw } as unknown as PrismaClient, {
      baseUrl: 'http://127.0.0.1:4100',
      secret: 'test-better-auth-secret-that-is-long-enough',
    });
    return {
      cleanup: () => ({ expiresBefore: cleanupExpiresBefore, query: cleanupQuery }),
      engine,
    };
  }

  it('returns only provider artifacts and performs bounded expired-session cleanup', async () => {
    const { cleanup, engine } = createEngine();
    jest.mocked(engine.auth.api.signInEmail).mockResolvedValue({
      token: 'provider-session-token',
      user: { id: USER_ID },
    });

    await expect(engine.authenticate('synthetic@example.invalid', 'password')).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'provider-session-token',
        providerUserId: USER_ID,
        refreshToken: 'provider-session-token',
      }),
    );
    expect(cleanup().query).toContain('limit 5000');
    expect(cleanup().expiresBefore).toBeInstanceOf(Date);
  });

  it('revokes every provider session after changing a password', async () => {
    const { engine } = createEngine();
    const context = await engine.auth.$context;
    jest.mocked(context.internalAdapter.findSession).mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000), userId: USER_ID },
    });
    jest.mocked(context.password.hash).mockResolvedValue('new-password-hash');

    await engine.changePassword('provider-session-token', 'new password');

    expect(context.internalAdapter.updatePassword).toHaveBeenCalledWith(
      USER_ID,
      'new-password-hash',
    );
    expect(context.internalAdapter.deleteUserSessions).toHaveBeenCalledWith(USER_ID);
  });

  it('honors local and global revocation scopes', async () => {
    const { engine } = createEngine();
    const context = await engine.auth.$context;

    await engine.revoke('local-token', 'local');
    expect(context.internalAdapter.deleteSession).toHaveBeenCalledWith('local-token');

    jest.mocked(context.internalAdapter.findSession).mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000), userId: USER_ID },
    });
    await engine.revoke('global-token', 'global');
    expect(context.internalAdapter.deleteUserSessions).toHaveBeenCalledWith(USER_ID);
  });
});
