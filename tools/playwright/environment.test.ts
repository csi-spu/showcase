import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalE2EEnvironment } from './environment.ts';

const validEnvironment = {
  ADMIN_URL: 'http://127.0.0.1:3001',
  APP_ENV: 'test',
  AUTH_IDENTITY_SECRET: 'local-test-identity-secret',
  CORE_URL: 'http://127.0.0.1:4100',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  E2E_LOCAL_ONLY: '1',
  MEDIA_PROVIDER_URL: 'http://127.0.0.1:4191',
  STUDENT_URL: 'http://localhost:3002',
  VISITOR_URL: 'http://localhost:3000',
};

test('accepts the explicit local test targets', () => {
  assert.equal(
    assertLocalE2EEnvironment(validEnvironment).databaseUrl,
    validEnvironment.DATABASE_URL,
  );
});

test('rejects a linked or remote database before privileged work', () => {
  assert.throws(
    () =>
      assertLocalE2EEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres',
      }),
    /E2E_SETUP_UNSAFE_TARGET/,
  );
});

test('rejects a non-loopback media target', () => {
  assert.throws(
    () =>
      assertLocalE2EEnvironment({
        ...validEnvironment,
        MEDIA_PROVIDER_URL: 'https://media.example.com',
      }),
    /E2E_SETUP_UNSAFE_TARGET/,
  );
});

test('rejects malformed targets and non-test mode', () => {
  assert.throws(
    () => assertLocalE2EEnvironment({ ...validEnvironment, DATABASE_URL: 'not-a-url' }),
    /E2E_SETUP_UNSAFE_TARGET/,
  );
  assert.throws(
    () => assertLocalE2EEnvironment({ ...validEnvironment, APP_ENV: 'development' }),
    /E2E_SETUP_UNSAFE_TARGET/,
  );
});
