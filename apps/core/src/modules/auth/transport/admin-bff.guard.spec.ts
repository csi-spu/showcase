import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthError } from '../application/auth.error';
import { AdminBffGuard } from './admin-bff.guard';

const SECRET = 'test-admin-bff-secret-that-is-long-enough';

function contextWithSecret(value: string | string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-admin-bff-secret': value } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminBffGuard', () => {
  const guard = new AdminBffGuard(new ConfigService({ ADMIN_BFF_SECRET: SECRET }));

  it('accepts only the configured Admin server-to-server secret', () => {
    expect(guard.canActivate(contextWithSecret(SECRET))).toBe(true);
    for (const rejected of [undefined, `${SECRET}-wrong`, [SECRET]]) {
      expect(() => guard.canActivate(contextWithSecret(rejected))).toThrow(
        new AuthError('FORBIDDEN', 403),
      );
    }
  });

  it('fails closed when the Admin BFF secret is not configured', () => {
    expect(() => new AdminBffGuard(new ConfigService())).toThrow();
  });
});
