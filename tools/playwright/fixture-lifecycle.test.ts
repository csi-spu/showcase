import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdempotentCleanup } from './fixture-lifecycle.ts';

test('equivalent cleanup retries share one successful bounded cleanup', async () => {
  let calls = 0;
  const cleanup = createIdempotentCleanup(async () => {
    calls += 1;
  });

  await Promise.all([cleanup(), cleanup()]);
  await cleanup();

  assert.equal(calls, 1);
});
