import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthError } from '../application/auth.error';
import { InstructorBffGuard } from './instructor-bff.guard';

const SECRET = 'test-instructor-bff-secret-that-is-long-enough';

function contextWithSecret(value: string | string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-instructor-bff-secret': value } }),
    }),
  } as unknown as ExecutionContext;
}

describe('InstructorBffGuard', () => {
  const guard = new InstructorBffGuard(new ConfigService({ INSTRUCTOR_BFF_SECRET: SECRET }));

  it('accepts only the configured Instructor server-to-server secret', () => {
    expect(guard.canActivate(contextWithSecret(SECRET))).toBe(true);
    for (const rejected of [undefined, `${SECRET}-wrong`, [SECRET]]) {
      expect(() => guard.canActivate(contextWithSecret(rejected))).toThrow(
        new AuthError('FORBIDDEN', 403),
      );
    }
  });

  it('fails closed when the Instructor BFF secret is not configured', () => {
    expect(() => new InstructorBffGuard(new ConfigService())).toThrow();
  });
});
