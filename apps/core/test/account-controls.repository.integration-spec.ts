import { ConfigService } from '@nestjs/config';
import { AccountControlsService } from '../src/modules/account-controls/application/account-controls.service';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import type {
  AuthProvider,
  IdentityProtector,
  TokenGenerator,
} from '../src/modules/auth/application/auth.ports';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresAccountControlsRepository } from '../src/modules/account-controls/infrastructure/postgres-account-controls.repository';
import { PostgresAuthRepository } from '../src/modules/auth/infrastructure/postgres-auth.repository';

const ADMIN_PERSON_ID = '51000000-0000-4000-8000-000000000001';
const ADMIN_ACCOUNT_ID = '51000000-0000-4000-8000-000000000002';
const ADMIN_PROVIDER_USER_ID = '51000000-0000-4000-8000-000000000003';
const STUDENT_PERSON_ID = '52000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '52000000-0000-4000-8000-000000000002';
const STUDENT_PROVIDER_USER_ID = '52000000-0000-4000-8000-000000000003';
const STUDENT_ID_HASH = '7'.repeat(64);
const SESSION_ID_HASH = '8'.repeat(64);
const YEAR_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000001';
const EXTENSION_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000002';
const RESET_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000003';
const CONCURRENT_YEAR_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000004';
const STUDENT_FLOW_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000005';
const PARALLEL_RESET_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000006';
const NOW = new Date('2026-08-25T06:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

interface AcademicYearSnapshot {
  current_academic_year: number | null;
  updated_at: Date;
  updated_by_account_id: string | null;
  version: number;
}

describe('PostgresAccountControlsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresAccountControlsRepository(database);
  const authRepository = new PostgresAuthRepository(database);
  let originalAcademicYear: AcademicYearSnapshot;

  beforeAll(async () => {
    const rows = await database.sql<AcademicYearSnapshot[]>`
      select current_academic_year, updated_at, updated_by_account_id, version
      from public.academic_settings where singleton = true
    `;
    originalAcademicYear = rows[0] ?? {
      current_academic_year: null,
      updated_at: NOW,
      updated_by_account_id: null,
      version: 0,
    };
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id) values (${ADMIN_PERSON_ID}), (${STUDENT_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${STUDENT_PERSON_ID}, 2560, 2567)
      `;
      await transaction`
        insert into public.accounts (
          id, person_id, provider_user_id, credential_state, created_at, updated_at
        ) values
          (${ADMIN_ACCOUNT_ID}, ${ADMIN_PERSON_ID}, ${ADMIN_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_ACCOUNT_ID}, ${STUDENT_PERSON_ID}, ${STUDENT_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW})
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ADMIN_ACCOUNT_ID}, 'admin'), (${STUDENT_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th)
        values (${STUDENT_PERSON_ID}, 'สมชาย', 'ใจดี')
      `;
      await transaction`
        insert into private.student_auth_identities (
          account_id, student_id_hash, synthetic_identity
        ) values (
          ${STUDENT_ACCOUNT_ID}, ${STUDENT_ID_HASH}, ${`${STUDENT_ID_HASH}@auth.invalid`}
        )
      `;
      await transaction`
        insert into private.authentication_sessions (
          session_id_hash,
          account_id,
          audience,
          provider_access_token,
          provider_refresh_token,
          provider_token_expires_at,
          created_at,
          last_activity_at,
          absolute_expires_at
        ) values (
          ${SESSION_ID_HASH},
          ${STUDENT_ACCOUNT_ID},
          'student',
          'private-access-token',
          'private-refresh-token',
          ${new Date('2026-08-25T07:00:00.000Z')},
          ${NOW},
          ${NOW},
          ${new Date('2026-09-01T06:00:00.000Z')}
        )
      `;
      await transaction`
        update public.academic_settings
        set current_academic_year = 2569,
            version = 10,
            updated_at = ${NOW},
            updated_by_account_id = null
        where singleton = true
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    const restoredUpdater = [ADMIN_ACCOUNT_ID, STUDENT_ACCOUNT_ID].includes(
      originalAcademicYear.updated_by_account_id ?? '',
    )
      ? null
      : originalAcademicYear.updated_by_account_id;
    await database.sql`
      update public.academic_settings
      set current_academic_year = ${originalAcademicYear.current_academic_year},
          updated_at = ${originalAcademicYear.updated_at},
          updated_by_account_id = ${restoredUpdater},
          version = ${originalAcademicYear.version}
      where singleton = true
    `;
    await database.onApplicationShutdown();
  });

  it('advances Current Academic Year once with optimistic and idempotent audit state', async () => {
    await expect(repository.getAcademicYear()).resolves.toEqual({
      currentAcademicYear: 2569,
      updatedAt: NOW,
      version: 10,
    });
    const input = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      currentAcademicYear: 2570,
      expectedVersion: 10,
      idempotencyKey: YEAR_IDEMPOTENCY_KEY,
      now: NOW,
    };
    await expect(repository.updateAcademicYear(input)).resolves.toEqual({
      outcome: 'updated',
      settings: { currentAcademicYear: 2570, updatedAt: NOW, version: 11 },
    });
    await expect(repository.updateAcademicYear(input)).resolves.toEqual({
      outcome: 'replayed',
      settings: { currentAcademicYear: 2570, updatedAt: NOW, version: 11 },
    });
    await expect(
      repository.updateAcademicYear({ ...input, currentAcademicYear: 2569, expectedVersion: 11 }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });
    const audits = await database.sql<{ count: number }[]>`
      select count(*)::integer as count
      from private.academic_year_change_audit_events
      where idempotency_key = ${YEAR_IDEMPOTENCY_KEY}
    `;
    expect(audits).toEqual([{ count: 1 }]);
  });

  it('finds safe Student controls and extends access with one audit and outbox event', async () => {
    await expect(repository.findStudent(STUDENT_ID_HASH)).resolves.toEqual({
      accessEndsAcademicYear: 2567,
      accountId: STUDENT_ACCOUNT_ID,
      currentAcademicYear: 2570,
      entryYear: 2560,
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      version: 1,
    });
    const input = {
      accessEndsAcademicYear: 2571,
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedVersion: 1,
      idempotencyKey: EXTENSION_IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'อนุมัติตามหลักฐานจากทะเบียน',
      studentAccountId: STUDENT_ACCOUNT_ID,
    };
    await expect(repository.extendStudentAccess(input)).resolves.toMatchObject({
      outcome: 'updated',
      student: { accessEndsAcademicYear: 2571, version: 2 },
    });
    await expect(repository.extendStudentAccess(input)).resolves.toMatchObject({
      outcome: 'replayed',
      student: { accessEndsAcademicYear: 2571, version: 2 },
    });
    const [audits, outbox] = await Promise.all([
      database.sql<{ count: number }[]>`
        select count(*)::integer as count
        from private.student_access_extension_audit_events
        where idempotency_key = ${EXTENSION_IDEMPOTENCY_KEY}
      `,
      database.sql<{ count: number }[]>`
        select count(*)::integer as count
        from private.outbox_events
        where aggregate_id = ${EXTENSION_IDEMPOTENCY_KEY}
          and event_type = 'student_access_extended'
      `,
    ]);
    expect(audits).toEqual([{ count: 1 }]);
    expect(outbox).toEqual([{ count: 1 }]);
    await expect(authRepository.findSession(SESSION_ID_HASH)).resolves.toMatchObject({
      currentAcademicYear: 2570,
      studentAccessEndsAcademicYear: 2571,
    });
  });

  it('serializes concurrent repeats of one academic-year command', async () => {
    const input = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      currentAcademicYear: 2571,
      expectedVersion: 11,
      idempotencyKey: CONCURRENT_YEAR_IDEMPOTENCY_KEY,
      now: NOW,
    };

    const results = await Promise.all([
      repository.updateAcademicYear(input),
      repository.updateAcademicYear(input),
    ]);

    expect(results.map((result) => result.outcome).sort()).toEqual(['replayed', 'updated']);
    await expect(repository.getAcademicYear()).resolves.toEqual({
      currentAcademicYear: 2571,
      updatedAt: NOW,
      version: 12,
    });
  });

  it('revokes sessions before provider reset and safely retries a failed operation', async () => {
    const input = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedVersion: 2,
      idempotencyKey: RESET_IDEMPOTENCY_KEY,
      now: NOW,
      studentAccountId: STUDENT_ACCOUNT_ID,
    };
    const concurrentBegins = await Promise.all([
      repository.beginPasswordReset(input),
      repository.beginPasswordReset(input),
    ]);
    expect(concurrentBegins).toEqual(
      expect.arrayContaining([
        {
          attemptNumber: 1,
          outcome: 'ready',
          providerUserId: STUDENT_PROVIDER_USER_ID,
        },
        { outcome: 'in_progress' },
      ]),
    );
    await expect(
      repository.beginPasswordReset({
        ...input,
        expectedVersion: 3,
        idempotencyKey: PARALLEL_RESET_IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ outcome: 'in_progress' });
    await expect(
      repository.beginPasswordReset({ ...input, now: new Date(NOW.getTime() + 120_000) }),
    ).resolves.toEqual({ outcome: 'in_progress' });
    const sessions = await database.sql<{ revocation_reason: string; revoked_at: Date }[]>`
      select revocation_reason, revoked_at
      from private.authentication_sessions
      where session_id_hash = ${SESSION_ID_HASH}
    `;
    expect(sessions).toEqual([{ revocation_reason: 'password_reset', revoked_at: NOW }]);
    await repository.failPasswordReset({
      attemptNumber: 1,
      errorCode: 'provider_unavailable',
      idempotencyKey: RESET_IDEMPOTENCY_KEY,
      now: NOW,
    });
    await expect(repository.beginPasswordReset(input)).resolves.toEqual({
      attemptNumber: 2,
      outcome: 'ready',
      providerUserId: STUDENT_PROVIDER_USER_ID,
    });
    await expect(
      repository.completePasswordReset({
        attemptNumber: 1,
        idempotencyKey: RESET_IDEMPOTENCY_KEY,
        now: NOW,
      }),
    ).resolves.toEqual({ outcome: 'not_pending' });
    await expect(
      repository.completePasswordReset({
        attemptNumber: 2,
        idempotencyKey: RESET_IDEMPOTENCY_KEY,
        now: NOW,
      }),
    ).resolves.toMatchObject({ outcome: 'completed', student: { version: 3 } });
    await expect(repository.beginPasswordReset(input)).resolves.toEqual({
      outcome: 'already_completed',
    });
    const operation = await database.sql<
      {
        actor_account_id: string;
        attempt_number: number;
        error_code: string | null;
        status: string;
      }[]
    >`
      select actor_account_id, attempt_number, error_code, status
      from private.student_password_reset_operations
      where idempotency_key = ${RESET_IDEMPOTENCY_KEY}
    `;
    expect(operation).toEqual([
      {
        actor_account_id: ADMIN_ACCOUNT_ID,
        attempt_number: 2,
        error_code: null,
        status: 'completed',
      },
    ]);
    const retained = await database.sql<{ accounts: number; people: number; students: number }[]>`
      select
        (select count(*)::integer from public.accounts where id = ${STUDENT_ACCOUNT_ID}) as accounts,
        (select count(*)::integer from public.people where id = ${STUDENT_PERSON_ID}) as people,
        (select count(*)::integer from public.students where person_id = ${STUDENT_PERSON_ID}) as students
    `;
    expect(retained).toEqual([{ accounts: 1, people: 1, students: 1 }]);
  });

  it('restricts the next Student session to password change after an Admin reset', async () => {
    const sessionIdHash = '6'.repeat(64);
    const sourceAddressHash = '9'.repeat(64);
    const temporaryPassword = 'one-time-random-password';
    const identityProtector: IdentityProtector = {
      hashAdminLogin: jest.fn(),
      hashSessionToken: () => sessionIdHash,
      hashSourceAddress: () => sourceAddressHash,
      hashStudentId: () => STUDENT_ID_HASH,
      toAdminSyntheticIdentity: jest.fn(),
      toSyntheticIdentity: () => `${STUDENT_ID_HASH}@auth.invalid`,
    };
    const tokenGenerator: TokenGenerator = {
      generate: (byteLength) => (byteLength === 18 ? temporaryPassword : 'student-session-token'),
    };
    const passwordProvider = { resetPassword: jest.fn().mockResolvedValue(undefined) };
    const controls = new AccountControlsService(
      repository,
      passwordProvider,
      { now: () => NOW },
      identityProtector,
      tokenGenerator,
    );

    await expect(
      controls.resetStudentPassword({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedVersion: 3,
        idempotencyKey: STUDENT_FLOW_IDEMPOTENCY_KEY,
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({
      student: { accountId: STUDENT_ACCOUNT_ID, version: 4 },
      temporaryPassword,
    });
    expect(passwordProvider.resetPassword).toHaveBeenCalledWith(
      STUDENT_PROVIDER_USER_ID,
      temporaryPassword,
    );

    const authProvider: AuthProvider = {
      authenticate: jest.fn().mockResolvedValue({
        accessToken: 'provider-access-token-after-reset',
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1_000),
        providerUserId: STUDENT_PROVIDER_USER_ID,
        refreshToken: 'provider-refresh-token-after-reset',
      }),
      changePassword: jest.fn(),
      refresh: jest.fn(),
      revoke: jest.fn(),
    };
    const studentAuth = new StudentAuthService(
      authRepository,
      authProvider,
      { now: () => NOW },
      identityProtector,
      tokenGenerator,
    );
    const login = await studentAuth.login({
      password: temporaryPassword,
      sourceAddress: '192.0.2.10',
      studentId: '69000001',
    });

    expect(authProvider.authenticate).toHaveBeenCalledWith(
      `${STUDENT_ID_HASH}@auth.invalid`,
      temporaryPassword,
    );
    expect(login).toEqual({
      canUseStudentCapabilities: false,
      sessionState: 'password_change_required',
      sessionToken: 'student-session-token',
    });
    await expect(studentAuth.authorizeStudentMutation(login.sessionToken)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.outbox_events
        where aggregate_id in (
          ${YEAR_IDEMPOTENCY_KEY},
          ${EXTENSION_IDEMPOTENCY_KEY},
          ${RESET_IDEMPOTENCY_KEY},
          ${CONCURRENT_YEAR_IDEMPOTENCY_KEY}
        )
      `;
      await transaction`
        delete from private.student_password_reset_operations
        where student_account_id = ${STUDENT_ACCOUNT_ID}
      `;
      await transaction`
        delete from private.student_access_extension_audit_events
        where student_account_id = ${STUDENT_ACCOUNT_ID}
      `;
      await transaction`
        delete from private.academic_year_change_audit_events
        where actor_account_id = ${ADMIN_ACCOUNT_ID}
      `;
      await transaction`
        delete from private.authentication_audit_events
        where account_id in (${ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID})
      `;
      await transaction`
        delete from private.authentication_sessions
        where account_id in (${ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID})
      `;
      await transaction`
        delete from private.authentication_rate_limits
        where key_hash in (${STUDENT_ID_HASH}, ${'9'.repeat(64)})
      `;
      await transaction`
        delete from private.student_auth_identities where account_id = ${STUDENT_ACCOUNT_ID}
      `;
      await transaction`
        delete from private.person_names where person_id = ${STUDENT_PERSON_ID}
      `;
      await transaction`
        delete from public.account_roles
        where account_id in (${ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID})
      `;
      await transaction`
        update public.academic_settings
        set updated_by_account_id = null
        where updated_by_account_id = ${ADMIN_ACCOUNT_ID}
      `;
      await transaction`
        delete from public.accounts where id in (${ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID})
      `;
      await transaction`delete from public.students where person_id = ${STUDENT_PERSON_ID}`;
      await transaction`
        delete from public.people where id in (${ADMIN_PERSON_ID}, ${STUDENT_PERSON_ID})
      `;
    });
  }
});
