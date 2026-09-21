import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import postgres from 'postgres';
import { assertLocalEnvironment } from './local-environment.mjs';

const environment = assertLocalEnvironment({
  BETTER_AUTH_SECRET: 'local-development-only-better-auth-secret',
  ...parseEnv(await readFile('apps/core/.env', 'utf8')),
  ...process.env,
});
const manifest = JSON.parse(await readFile('.scratch/qa-pr113.json', 'utf8'));
const account = (key) => manifest.accounts.find((item) => item.key === key);
const group = (key) => manifest.groups.find((item) => item.key === key);

test('repeated seed preserves accounts, roles and memberships', async () => {
  const sql = postgres(environment.DATABASE_URL, { max: 1, connect_timeout: 5 });
  try {
    const snapshot = async () => ({
      accounts: await sql`select id, status, credential_state, provider_user_id from public.accounts
        where id in ${sql(manifest.accounts.map((item) => item.accountId))} order by id`,
      roles: await sql`select account_id, role from public.account_roles
        where account_id in ${sql(manifest.accounts.map((item) => item.accountId))} order by account_id, role`,
      memberships: await sql`select * from public.collection_group_memberships
        where group_id in ${sql(manifest.groups.map((item) => item.id))} order by group_id, student_account_id`,
    });
    const before = await snapshot();
    assert.equal(before.accounts.length, 16);
    execFileSync(process.execPath, ['tools/qa/seed-pr113.mjs'], { stdio: 'pipe', timeout: 30000 });
    const after = await snapshot();
    // Avoid assertion dumps of provider identifiers.
    assert.equal(
      JSON.stringify(after) === JSON.stringify(before),
      true,
      'Seed changed existing QA data',
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
});

test('seeded identities authenticate with correct roles and expose prepared groups', async (t) => {
  const sql = postgres(environment.DATABASE_URL, { max: 1, connect_timeout: 5 });
  const fixtureHashes = manifest.accounts.map((item) =>
    createHmac('sha256', environment.API_KEY)
      .update(item.roles.includes('student') ? 'student-id' : 'admin-login')
      .update('\0')
      .update(item.login)
      .digest('hex'),
  );
  const clearFixtureRateLimits = () => sql`delete from private.authentication_rate_limits
    where key_kind = 'account' and key_hash in ${sql(fixtureHashes)}`;
  t.after(async () => {
    try {
      await clearFixtureRateLimits();
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
  // Smoke checks must not leave these dedicated fixtures locked out for manual QA.
  await clearFixtureRateLimits();
  const request = async (surface, path, body, token) => {
    const response = await fetch(`${environment.CORE_URL}/v1/internal/${surface}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        [`x-${surface}-bff-secret`]: environment.API_KEY,
        'x-client-address': `qa113-${randomUUID()}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
    };
  };
  for (const [key, surface, expectedStatus, state] of [
    ['admin', 'admin', 200, 'active'],
    ['instructor-a', 'instructor', 200, 'active'],
    ['instructor-b', 'instructor', 200, 'active'],
    ['dual-role', 'admin', 200, 'active'],
    ['dual-role', 'instructor', 200, 'active'],
    ['initial-instructor', 'instructor', 200, 'password_change_required'],
    ['current', 'student-collection', 200, 'active'],
    ['initial-student', 'student-collection', 200, 'password_change_required'],
    ['alumnus', 'student-collection', 200, 'active'],
    ['admin', 'instructor', 401],
    ['instructor-a', 'admin', 401],
    ['suspended-instructor', 'instructor', 401],
    ['suspended-student', 'student-collection', 401],
  ]) {
    const fixture = account(key);
    const loginField =
      surface === 'admin'
        ? 'adminLogin'
        : surface === 'instructor'
          ? 'instructorLogin'
          : 'studentId';
    const result = await request(surface, 'auth/login', {
      [loginField]: fixture.login,
      password: fixture.password,
    });
    assert.equal(result.status, expectedStatus, `${key}/${surface} login status`);
    if (expectedStatus !== 200) continue;
    const token = result.data.sessionToken;
    try {
      assert.equal(result.data.sessionState, state, `${key} session state`);
      if (key === 'instructor-b') {
        const rounds = await request(surface, 'rounds', undefined, token);
        assert.equal(rounds.status, 200);
        assert.equal(
          rounds.data.some((item) => item.id === manifest.rounds[0].id),
          true,
        );
        const mixed = await request(surface, `groups/${group('mixed').id}`, undefined, token);
        assert.equal(mixed.status, 200);
        assert.equal(
          mixed.data.members.some((item) => item.status === 'current'),
          true,
        );
        assert.equal(
          mixed.data.members.some((item) => item.status === 'withdrawn'),
          true,
        );
        const wrongAudience = await request('admin', 'auth/session', undefined, token);
        assert.equal(wrongAudience.status, 401);
      }
    } finally {
      const logout = await request(surface, 'auth/logout', {}, token);
      assert.equal(logout.status, 204, `${key} logout`);
    }
  }
});
