import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalEnvironment } from './local-environment.mjs';

const local = {
  APP_ENV: 'development',
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:password@127.0.0.1:5432/postgres',
  CORE_URL: 'http://127.0.0.1:4100',
  API_KEY: 'local-development-only-shared-api-key',
  BETTER_AUTH_SECRET: 'local-development-only-better-auth-secret',
};

test('accepts explicit local development configuration', () => {
  assert.doesNotThrow(() => assertLocalEnvironment(local));
});

test('rejects remote, production and ambiguous targets before seeding', () => {
  for (const override of [
    { APP_ENV: 'production' },
    { APP_ENV: undefined },
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://user:password@db.example.com/postgres' },
    { DATABASE_URL: `${local.DATABASE_URL}?host=db.example.com` },
    { CORE_URL: 'https://core.example.com' },
    { API_KEY: '' },
    { BETTER_AUTH_SECRET: '' },
  ]) {
    assert.throws(() => assertLocalEnvironment({ ...local, ...override }), /QA_LOCAL/);
  }
});
