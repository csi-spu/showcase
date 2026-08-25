import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresAuthRepository } from '../src/modules/auth/infrastructure/postgres-auth.repository';
import { NewAuthenticationSession } from '../src/modules/auth/application/auth.ports';

const PERSON_ID = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '10000000-0000-4000-8000-000000000002';
const PROVIDER_USER_ID = '10000000-0000-4000-8000-000000000003';
const STUDENT_ID_HASH = 'a'.repeat(64);
const ADMIN_LOGIN_HASH = 'e'.repeat(64);
const SOURCE_KEY_HASH = 'b'.repeat(64);
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresAuthRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresAuthRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${PERSON_ID})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${PERSON_ID}, 2569, 2576)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id)
        values (${ACCOUNT_ID}, ${PERSON_ID}, ${PROVIDER_USER_ID})
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ACCOUNT_ID}, 'student'), (${ACCOUNT_ID}, 'admin')
      `;
      await transaction`
        insert into private.admin_auth_identities (
          account_id,
          admin_login_hash,
          synthetic_identity
        ) values (
          ${ACCOUNT_ID},
          ${ADMIN_LOGIN_HASH},
          ${`${ADMIN_LOGIN_HASH}@admin.auth.invalid`}
        )
      `;
      await transaction`
        insert into private.student_auth_identities (
          account_id,
          student_id_hash,
          synthetic_identity
        ) values (${ACCOUNT_ID}, ${STUDENT_ID_HASH}, ${`${STUDENT_ID_HASH}@auth.invalid`})
      `;
    });
  });

  it('reads current Admin Account and role through its private login identity', async () => {
    await expect(repository.findAdminLoginAccount(ADMIN_LOGIN_HASH)).resolves.toMatchObject({
      accountId: ACCOUNT_ID,
      accountStatus: 'active',
      adminLoginHash: ADMIN_LOGIN_HASH,
      credentialState: 'initial',
      hasAdminRole: true,
      providerUserId: PROVIDER_USER_ID,
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('reads current Account, role, Student access, and private identity state', async () => {
    await expect(repository.findLoginAccount(STUDENT_ID_HASH)).resolves.toMatchObject({
      accountId: ACCOUNT_ID,
      accountStatus: 'active',
      credentialState: 'initial',
      currentAcademicYear: 2569,
      entryYear: 2569,
      hasStudentRole: true,
      providerUserId: PROVIDER_USER_ID,
      studentAccessEndsAcademicYear: 2576,
      studentIdHash: STUDENT_ID_HASH,
    });
  });

  it('rate-limits both stable Account-safe and source keys atomically', async () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        repository.consumeLoginAttempt({
          accountKeyHash: STUDENT_ID_HASH,
          limit: 5,
          now,
          sourceKeyHash: SOURCE_KEY_HASH,
          windowSeconds: 900,
        }),
      ).resolves.toEqual({ isAllowed: true, retryAfterSeconds: 0 });
    }
    await expect(
      repository.consumeLoginAttempt({
        accountKeyHash: STUDENT_ID_HASH,
        limit: 5,
        now,
        sourceKeyHash: SOURCE_KEY_HASH,
        windowSeconds: 900,
      }),
    ).resolves.toEqual({ isAllowed: false, retryAfterSeconds: 900 });
  });

  it('persists an opaque session then atomically replaces every older Account session', async () => {
    const initial = createSession('c', 'student_login', '2026-08-24T12:00:00.000Z');
    await repository.createSession(initial);
    await expect(repository.findSession(initial.sessionIdHash)).resolves.toMatchObject({
      accountId: ACCOUNT_ID,
      credentialState: 'initial',
      revokedAt: null,
      sessionIdHash: initial.sessionIdHash,
    });

    const replacement = createSession('d', 'student_password_changed', '2026-08-24T12:05:00.000Z');
    await repository.replaceAllAccountSessions(replacement);

    await expect(repository.findSession(initial.sessionIdHash)).resolves.toMatchObject({
      credentialState: 'set',
      revokedAt: new Date('2026-08-24T12:05:00.000Z'),
    });
    await expect(repository.findSession(replacement.sessionIdHash)).resolves.toMatchObject({
      credentialState: 'set',
      revokedAt: null,
      sessionIdHash: replacement.sessionIdHash,
    });
  });

  it('resolves sessions only through their matching audience for a dual-role Person', async () => {
    const student = createSession('f', 'student_login', '2026-08-24T13:00:00.000Z');
    const admin: NewAuthenticationSession = {
      ...createSession('9', 'admin_login', '2026-08-24T13:01:00.000Z'),
      absoluteExpiresAt: new Date('2026-08-24T21:01:00.000Z'),
      audience: 'admin',
    };
    await repository.createSession(student);
    await repository.createSession(admin);

    await expect(repository.findSession(student.sessionIdHash)).resolves.toMatchObject({
      sessionIdHash: student.sessionIdHash,
    });
    await expect(repository.findAdminSession(student.sessionIdHash)).resolves.toBeNull();
    await expect(repository.findAdminSession(admin.sessionIdHash)).resolves.toMatchObject({
      sessionIdHash: admin.sessionIdHash,
    });
    await expect(repository.findSession(admin.sessionIdHash)).resolves.toBeNull();
  });

  function createSession(
    hashCharacter: string,
    eventType: NewAuthenticationSession['eventType'],
    timestamp: string,
  ): NewAuthenticationSession {
    const now = new Date(timestamp);
    return {
      absoluteExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
      accountId: ACCOUNT_ID,
      audience: 'student',
      eventType,
      now,
      providerSession: {
        accessToken: `access-${hashCharacter}`,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
        providerUserId: PROVIDER_USER_ID,
        refreshToken: `refresh-${hashCharacter}`,
      },
      sessionIdHash: hashCharacter.repeat(64),
    };
  }

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.authentication_audit_events where account_id = ${ACCOUNT_ID}
      `;
      await transaction`
        delete from private.authentication_sessions where account_id = ${ACCOUNT_ID}
      `;
      await transaction`
        delete from private.authentication_rate_limits
        where key_hash in (${STUDENT_ID_HASH}, ${ADMIN_LOGIN_HASH}, ${SOURCE_KEY_HASH})
      `;
      await transaction`
        delete from private.admin_auth_identities where account_id = ${ACCOUNT_ID}
      `;
      await transaction`
        delete from private.student_auth_identities where account_id = ${ACCOUNT_ID}
      `;
      await transaction`delete from public.account_roles where account_id = ${ACCOUNT_ID}`;
      await transaction`delete from public.accounts where id = ${ACCOUNT_ID}`;
      await transaction`delete from public.students where person_id = ${PERSON_ID}`;
      await transaction`delete from public.people where id = ${PERSON_ID}`;
    });
  }
});
