import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthError } from '../application/auth.error';
import { StudentCollectionBffGuard } from './student-collection-bff.guard';

const SECRET = 'test-student-collection-bff-secret-that-is-long-enough';

function contextWithSecret(value: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-student-collection-bff-secret': value } }),
    }),
  } as unknown as ExecutionContext;
}

describe('StudentCollectionBffGuard', () => {
  const guard = new StudentCollectionBffGuard(
    new ConfigService({ STUDENT_COLLECTION_BFF_SECRET: SECRET }),
  );

  it('accepts only the configured server-to-server secret', () => {
    expect(guard.canActivate(contextWithSecret(SECRET))).toBe(true);
    expect(() => guard.canActivate(contextWithSecret(undefined))).toThrow(
      new AuthError('FORBIDDEN', 403),
    );
    expect(() => guard.canActivate(contextWithSecret(`${SECRET}-wrong`))).toThrow(
      new AuthError('FORBIDDEN', 403),
    );
  });
});
