import test from 'node:test';
import { verifyWorkLifecycleFixtureIntegration } from './fixtures.ts';

test('Work fixture creates and cleans only its exact local Auth and Postgres resources', async () => {
  try {
    await verifyWorkLifecycleFixtureIntegration();
  } catch (error: unknown) {
    const code = error instanceof Error ? /E2E_[A-Z_]+/u.exec(error.message)?.[0] : undefined;
    throw new Error(code ?? 'E2E_FIXTURE_INTEGRATION_FAILED');
  }
});
