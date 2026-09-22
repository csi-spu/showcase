import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalE2EEnvironment } from './environment.ts';

const validEnvironment = {
  ADMIN_URL: 'http://127.0.0.1:3001',
  API_KEY: 'local-test-identity-secret',
  APP_ENV: 'test',
  CORE_URL: 'http://127.0.0.1:4100',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  E2E_LOCAL_ONLY: '1',
  INSTRUCTOR_URL: 'http://127.0.0.1:3003',
  MEDIA_PROVIDER_URL: 'http://127.0.0.1:4191',
  STUDENT_COLLECTION_URL: 'http://localhost:3004',
  STUDENT_URL: 'http://localhost:3002',
  VISITOR_URL: 'http://localhost:3000',
};

test('accepts the explicit local test targets', () => {
  const environment = assertLocalE2EEnvironment(validEnvironment);

  assert.equal(environment.databaseUrl, validEnvironment.DATABASE_URL);
  assert.equal(environment.instructorUrl, validEnvironment.INSTRUCTOR_URL);
  assert.equal(environment.studentCollectionUrl, validEnvironment.STUDENT_COLLECTION_URL);
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

test('rejects non-loopback collection frontend targets', () => {
  assert.throws(
    () =>
      assertLocalE2EEnvironment({
        ...validEnvironment,
        INSTRUCTOR_URL: 'https://instructor.example.com',
      }),
    /E2E_SETUP_UNSAFE_TARGET/,
  );
  assert.throws(
    () =>
      assertLocalE2EEnvironment({
        ...validEnvironment,
        STUDENT_COLLECTION_URL: 'https://collection.example.com',
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
