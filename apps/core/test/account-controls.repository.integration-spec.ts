import { ConfigService } from '@nestjs/config';
import { AccountControlsService } from '../src/modules/account-controls/application/account-controls.service';
import { AdminProvisioningService } from '../src/modules/auth/application/admin-provisioning.service';
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
const SECOND_ADMIN_PERSON_ID = '51000000-0000-4000-8000-000000000021';
const SECOND_ADMIN_ACCOUNT_ID = '51000000-0000-4000-8000-000000000022';
const SECOND_ADMIN_PROVIDER_USER_ID = '51000000-0000-4000-8000-000000000023';
const INSTRUCTOR_ELIGIBLE_PERSON_ID = '55000000-0000-4000-8000-000000000001';
const INSTRUCTOR_ELIGIBLE_ACCOUNT_ID = '55000000-0000-4000-8000-000000000002';
const INSTRUCTOR_ELIGIBLE_PROVIDER_USER_ID = '55000000-0000-4000-8000-000000000003';
const INSTRUCTOR_ELIGIBLE_LOGIN_HASH = '61'.repeat(32);
const SUSPENDED_STAFF_PERSON_ID = '55000000-0000-4000-8000-000000000011';
const SUSPENDED_STAFF_ACCOUNT_ID = '55000000-0000-4000-8000-000000000012';
const SUSPENDED_STAFF_PROVIDER_USER_ID = '55000000-0000-4000-8000-000000000013';
const SUSPENDED_STAFF_LOGIN_HASH = '62'.repeat(32);
const GRANT_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000015';
const REPLAYED_GRANT_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000016';
const REVOKE_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000017';
const SUSPENDED_GRANT_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000018';
const STUDENT_PERSON_ID = '52000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '52000000-0000-4000-8000-000000000002';
const STUDENT_PROVIDER_USER_ID = '52000000-0000-4000-8000-000000000003';
const NAME_STUDENT_PERSON_ID = '52000000-0000-4000-8000-000000000011';
const NAME_STUDENT_ACCOUNT_ID = '52000000-0000-4000-8000-000000000012';
const NAME_STUDENT_PROVIDER_USER_ID = '52000000-0000-4000-8000-000000000013';
const NAME_PROFILE_PUBLIC_ID = '52000000-0000-4000-8000-000000000014';
const STATUS_STUDENT_PERSON_ID = '52000000-0000-4000-8000-000000000021';
const STATUS_STUDENT_ACCOUNT_ID = '52000000-0000-4000-8000-000000000022';
const STATUS_STUDENT_PROVIDER_USER_ID = '52000000-0000-4000-8000-000000000023';
const STATUS_SESSION_ID_HASH = '6'.repeat(64);
const STUDENT_ID_HASH = '7'.repeat(64);
const SESSION_ID_HASH = '8'.repeat(64);
const YEAR_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000001';
const EXTENSION_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000002';
const RESET_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000003';
const CONCURRENT_YEAR_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000004';
const STUDENT_FLOW_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000005';
const PARALLEL_RESET_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000006';
const NAME_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000007';
const SECOND_NAME_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000008';
const SUSPEND_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000009';
const REACTIVATE_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000010';
const STALE_VERSION_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000011';
const STUDENT_SUSPEND_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000012';
const STUDENT_REACTIVATE_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000013';
const STUDENT_STALE_IDEMPOTENCY_KEY = '53000000-0000-4000-8000-000000000014';
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
        insert into public.people (id)
        values (${ADMIN_PERSON_ID}), (${SECOND_ADMIN_PERSON_ID}),
          (${STUDENT_PERSON_ID}), (${NAME_STUDENT_PERSON_ID}), (${STATUS_STUDENT_PERSON_ID}),
          (${INSTRUCTOR_ELIGIBLE_PERSON_ID}), (${SUSPENDED_STAFF_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${STUDENT_PERSON_ID}, 2560, 2567), (${NAME_STUDENT_PERSON_ID}, 2569, 2576),
          (${STATUS_STUDENT_PERSON_ID}, 2569, 2576)
      `;
      await transaction`
        insert into public.accounts (
          id, person_id, provider_user_id, credential_state, created_at, updated_at
        ) values
          (${ADMIN_ACCOUNT_ID}, ${ADMIN_PERSON_ID}, ${ADMIN_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${SECOND_ADMIN_ACCOUNT_ID}, ${SECOND_ADMIN_PERSON_ID}, ${SECOND_ADMIN_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_ACCOUNT_ID}, ${STUDENT_PERSON_ID}, ${STUDENT_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${NAME_STUDENT_ACCOUNT_ID}, ${NAME_STUDENT_PERSON_ID}, ${NAME_STUDENT_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${STATUS_STUDENT_ACCOUNT_ID}, ${STATUS_STUDENT_PERSON_ID}, ${STATUS_STUDENT_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${INSTRUCTOR_ELIGIBLE_PERSON_ID}, ${INSTRUCTOR_ELIGIBLE_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${SUSPENDED_STAFF_ACCOUNT_ID}, ${SUSPENDED_STAFF_PERSON_ID}, ${SUSPENDED_STAFF_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW})
      `;
      await transaction`
        update public.accounts set status = 'suspended' where id = ${SUSPENDED_STAFF_ACCOUNT_ID}
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ADMIN_ACCOUNT_ID}, 'admin'), (${SECOND_ADMIN_ACCOUNT_ID}, 'admin'),
          (${STUDENT_ACCOUNT_ID}, 'student'), (${NAME_STUDENT_ACCOUNT_ID}, 'student'),
          (${STATUS_STUDENT_ACCOUNT_ID}, 'student'),
          (${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, 'admin'), (${SUSPENDED_STAFF_ACCOUNT_ID}, 'admin')
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th)
        values (${ADMIN_PERSON_ID}, 'ผู้ดูแล', 'ระบบ'),
          (${SECOND_ADMIN_PERSON_ID}, 'ผู้ดูแล', 'สำรอง'),
          (${STUDENT_PERSON_ID}, 'สมชาย', 'ใจดี'),
          (${NAME_STUDENT_PERSON_ID}, 'สมชาย', 'เดิมดี'),
          (${STATUS_STUDENT_PERSON_ID}, 'ระงับ', 'ทดสอบ'),
          (${INSTRUCTOR_ELIGIBLE_PERSON_ID}, 'ผู้สอน', 'มีสิทธิ์'),
          (${SUSPENDED_STAFF_PERSON_ID}, 'ผู้สอน', 'ถูกระงับ')
      `;
      await transaction`
        insert into private.admin_auth_identities (account_id, admin_login_hash, synthetic_identity)
        values
          (${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${INSTRUCTOR_ELIGIBLE_LOGIN_HASH}, ${`${INSTRUCTOR_ELIGIBLE_LOGIN_HASH}@admin.auth.invalid`}),
          (${SUSPENDED_STAFF_ACCOUNT_ID}, ${SUSPENDED_STAFF_LOGIN_HASH}, ${`${SUSPENDED_STAFF_LOGIN_HASH}@admin.auth.invalid`})
      `;
      await transaction`
        insert into public.public_profiles (
          person_id, public_id, display_name, bio, version,
          created_at, updated_at, normalized_display_name
        ) values (
          ${NAME_STUDENT_PERSON_ID}, ${NAME_PROFILE_PUBLIC_ID}, 'สมชาย เดิมดี', null, 1,
          ${NOW}, ${NOW}, 'สมชาย เดิมดี'
        )
      `;
      await transaction`
        insert into public.profile_consents (person_id, consent_text_version, granted_at)
        values (${NAME_STUDENT_PERSON_ID}, 'phase-1-v1', ${NOW})
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
      status: 'active',
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
    const [audits] = await Promise.all([
      database.sql<{ count: number }[]>`
        select count(*)::integer as count
        from private.student_access_extension_audit_events
        where idempotency_key = ${EXTENSION_IDEMPOTENCY_KEY}
      `,
    ]);
    expect(audits).toEqual([{ count: 1 }]);
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

  it('lists Students and Admins with cursor pagination and a Thai name search', async () => {
    const firstPage = await repository.listStudents({ cursor: null, limit: 1, search: null });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await repository.listStudents({
      cursor: firstPage.nextCursor,
      limit: 1,
      search: null,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.accountId).not.toBe(firstPage.items[0]?.accountId);

    const searched = await repository.listStudents({ cursor: null, limit: 10, search: 'สมชาย' });
    expect(searched.items.map((student) => student.accountId).sort()).toEqual(
      [STUDENT_ACCOUNT_ID, NAME_STUDENT_ACCOUNT_ID].sort(),
    );
    await expect(
      repository.listStudents({ cursor: null, limit: 10, search: 'ไม่มีชื่อนี้แน่นอน' }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    const admins = await repository.listAdmins({ cursor: null, limit: 10, search: 'ผู้ดูแล' });
    expect(admins.items.map((admin) => admin.accountId).sort()).toEqual(
      [ADMIN_ACCOUNT_ID, SECOND_ADMIN_ACCOUNT_ID].sort(),
    );
    expect(admins.items.every((admin) => admin.status === 'active')).toBe(true);
  });

  it('suspends and reactivates an Admin Account idempotently, and forbids self-suspend', async () => {
    await expect(
      repository.setAdminStatus({
        actorAccountId: ADMIN_ACCOUNT_ID,
        adminAccountId: ADMIN_ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: SUSPEND_IDEMPOTENCY_KEY,
        now: NOW,
        reason: 'ทดสอบห้ามระงับตัวเอง',
        status: 'suspended',
      }),
    ).resolves.toEqual({ outcome: 'self_status_change' });

    const sessionIdHash = '5'.repeat(64);
    await database.sql`
      insert into private.authentication_sessions (
        session_id_hash, account_id, audience, provider_access_token, provider_refresh_token,
        provider_token_expires_at, created_at, last_activity_at, absolute_expires_at
      ) values (
        ${sessionIdHash}, ${SECOND_ADMIN_ACCOUNT_ID}, 'admin', 'admin-access-token',
        'admin-refresh-token', ${new Date(NOW.getTime() + 3_600_000)}, ${NOW}, ${NOW},
        ${new Date(NOW.getTime() + 7 * 24 * 3_600_000)}
      )
    `;

    const suspendInput = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      adminAccountId: SECOND_ADMIN_ACCOUNT_ID,
      expectedVersion: 1,
      idempotencyKey: SUSPEND_IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'ระงับชั่วคราวตามคำขอ',
      status: 'suspended' as const,
    };
    await expect(repository.setAdminStatus(suspendInput)).resolves.toEqual({
      admin: {
        accountId: SECOND_ADMIN_ACCOUNT_ID,
        createdAt: NOW,
        firstNameTh: 'ผู้ดูแล',
        hasInstructorRole: false,
        lastNameTh: 'สำรอง',
        status: 'suspended',
        version: 2,
      },
      outcome: 'updated',
    });
    await expect(repository.setAdminStatus(suspendInput)).resolves.toEqual({
      admin: {
        accountId: SECOND_ADMIN_ACCOUNT_ID,
        createdAt: NOW,
        firstNameTh: 'ผู้ดูแล',
        hasInstructorRole: false,
        lastNameTh: 'สำรอง',
        status: 'suspended',
        version: 2,
      },
      outcome: 'replayed',
    });
    await expect(
      repository.setAdminStatus({ ...suspendInput, reason: 'เหตุผลอื่นที่ไม่ตรงกับ audit เดิม' }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });

    const sessionAfterSuspend = await database.sql<{ revocation_reason: string | null }[]>`
      select revocation_reason from private.authentication_sessions
      where session_id_hash = ${sessionIdHash}
    `;
    expect(sessionAfterSuspend).toEqual([{ revocation_reason: 'admin_suspended' }]);

    await expect(
      repository.setAdminStatus({
        ...suspendInput,
        expectedVersion: 2,
        idempotencyKey: REACTIVATE_IDEMPOTENCY_KEY,
        reason: 'คืนสิทธิ์หลังตรวจสอบแล้ว',
        status: 'active',
      }),
    ).resolves.toMatchObject({ admin: { status: 'active', version: 3 }, outcome: 'updated' });
    await expect(
      repository.setAdminStatus({
        ...suspendInput,
        expectedVersion: 99,
        idempotencyKey: STALE_VERSION_IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ outcome: 'version_conflict' });
  });

  it('grants and revokes Instructor access on an eligible Account, replaying idempotently', async () => {
    const grantInput = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      idempotencyKey: GRANT_IDEMPOTENCY_KEY,
      instructorAccountId: INSTRUCTOR_ELIGIBLE_ACCOUNT_ID,
      now: NOW,
    };
    await expect(repository.grantInstructorRole(grantInput)).resolves.toMatchObject({
      instructor: { accountId: INSTRUCTOR_ELIGIBLE_ACCOUNT_ID },
      outcome: 'granted',
    });
    // Retrying the exact same grant request must be a safe no-op, distinct
    // from a fresh grant, so a caller cannot mistake a replay for new action.
    await expect(repository.grantInstructorRole(grantInput)).resolves.toMatchObject({
      instructor: { accountId: INSTRUCTOR_ELIGIBLE_ACCOUNT_ID },
      outcome: 'replayed',
    });
    await expect(
      repository.grantInstructorRole({
        ...grantInput,
        idempotencyKey: REPLAYED_GRANT_IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ outcome: 'already_granted' });

    const revokeInput = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      idempotencyKey: REVOKE_IDEMPOTENCY_KEY,
      instructorAccountId: INSTRUCTOR_ELIGIBLE_ACCOUNT_ID,
      now: NOW,
    };
    await expect(repository.revokeInstructorRole(revokeInput)).resolves.toMatchObject({
      instructor: { accountId: INSTRUCTOR_ELIGIBLE_ACCOUNT_ID },
      outcome: 'revoked',
    });
    await expect(repository.revokeInstructorRole(revokeInput)).resolves.toMatchObject({
      instructor: { accountId: INSTRUCTOR_ELIGIBLE_ACCOUNT_ID },
      outcome: 'replayed',
    });
  });

  it('refuses to grant Instructor access to a suspended Account', async () => {
    await expect(
      repository.grantInstructorRole({
        actorAccountId: ADMIN_ACCOUNT_ID,
        idempotencyKey: SUSPENDED_GRANT_IDEMPOTENCY_KEY,
        instructorAccountId: SUSPENDED_STAFF_ACCOUNT_ID,
        now: NOW,
      }),
    ).resolves.toEqual({ outcome: 'not_eligible' });
  });

  it('suspends and reactivates a Student Account idempotently, revoking live sessions', async () => {
    // A dedicated Account: this flow bumps control_version, so sharing a fixture
    // with the name-correction or extension tests would break their expected
    // version. The Student gets a live session because a suspension has to end
    // access immediately rather than at the next login.
    await database.sql`
      insert into private.authentication_sessions (
        session_id_hash, account_id, audience, provider_access_token, provider_refresh_token,
        provider_token_expires_at, created_at, last_activity_at, absolute_expires_at
      ) values (
        ${STATUS_SESSION_ID_HASH}, ${STATUS_STUDENT_ACCOUNT_ID}, 'student', 'student-access-token',
        'student-refresh-token', ${new Date(NOW.getTime() + 3_600_000)}, ${NOW}, ${NOW},
        ${new Date(NOW.getTime() + 7 * 24 * 3_600_000)}
      )
    `;

    const suspendInput = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedVersion: 1,
      idempotencyKey: STUDENT_SUSPEND_IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'ระงับบัญชีตามคำขอจากคณะ',
      status: 'suspended' as const,
      studentAccountId: STATUS_STUDENT_ACCOUNT_ID,
    };
    await expect(repository.setStudentStatus(suspendInput)).resolves.toMatchObject({
      outcome: 'updated',
      student: { accountId: STATUS_STUDENT_ACCOUNT_ID, status: 'suspended', version: 2 },
    });
    await expect(repository.setStudentStatus(suspendInput)).resolves.toMatchObject({
      outcome: 'replayed',
      student: { accountId: STATUS_STUDENT_ACCOUNT_ID, status: 'suspended', version: 2 },
    });
    await expect(
      repository.setStudentStatus({
        ...suspendInput,
        reason: 'เหตุผลอื่นที่ไม่ตรงกับ audit เดิม',
      }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });

    const sessions = await database.sql<{ revocation_reason: string | null }[]>`
      select revocation_reason from private.authentication_sessions
      where session_id_hash = ${STATUS_SESSION_ID_HASH}
    `;
    expect(sessions).toEqual([{ revocation_reason: 'admin_suspended' }]);

    const audits = await database.sql<{ count: number }[]>`
      select count(*)::integer as count
      from private.student_status_change_audit_events
      where idempotency_key = ${STUDENT_SUSPEND_IDEMPOTENCY_KEY}
    `;
    expect(audits).toEqual([{ count: 1 }]);

    await expect(
      repository.setStudentStatus({
        ...suspendInput,
        expectedVersion: 2,
        idempotencyKey: STUDENT_REACTIVATE_IDEMPOTENCY_KEY,
        reason: 'คืนสิทธิ์หลังตรวจสอบแล้ว',
        status: 'active',
      }),
    ).resolves.toMatchObject({
      outcome: 'updated',
      student: { status: 'active', version: 3 },
    });
    await expect(
      repository.setStudentStatus({
        ...suspendInput,
        expectedVersion: 99,
        idempotencyKey: STUDENT_STALE_IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ outcome: 'version_conflict' });
  });

  it('corrects Roster Name idempotently with audit and public cache invalidation', async () => {
    const input = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedVersion: 1,
      firstNameTh: 'สมหญิง',
      idempotencyKey: NAME_IDEMPOTENCY_KEY,
      lastNameTh: 'มั่นใจ',
      now: NOW,
      reason: 'แก้ไขตามหลักฐานทะเบียน',
      studentAccountId: NAME_STUDENT_ACCOUNT_ID,
    };

    await expect(repository.correctStudentName(input)).resolves.toMatchObject({
      outcome: 'updated',
      student: { firstNameTh: 'สมหญิง', lastNameTh: 'มั่นใจ', version: 2 },
    });
    await expect(repository.correctStudentName(input)).resolves.toMatchObject({
      outcome: 'replayed',
      student: { firstNameTh: 'สมหญิง', lastNameTh: 'มั่นใจ', version: 2 },
    });
    await expect(repository.correctStudentName({ ...input, firstNameTh: 'สมพร' })).resolves.toEqual(
      { outcome: 'idempotency_conflict' },
    );

    const [names, audits, outbox] = await Promise.all([
      database.sql<{ first_name_th: string; last_name_th: string }[]>`
        select first_name_th, last_name_th
        from private.person_names
        where person_id = ${NAME_STUDENT_PERSON_ID}
      `,
      database.sql<
        {
          first_name_th: string;
          last_name_th: string;
          previous_first_name_th: string;
          previous_last_name_th: string;
          reason: string;
          resulting_version: number;
        }[]
      >`
        select previous_first_name_th, previous_last_name_th, first_name_th, last_name_th,
          reason, resulting_version
        from private.person_name_correction_audit_events
        where idempotency_key = ${NAME_IDEMPOTENCY_KEY}
      `,
      database.sql<{ event_type: string; payload: { publicId: string } }[]>`
        select event_type, payload
        from private.outbox_events
        where aggregate_id = ${NAME_IDEMPOTENCY_KEY}
      `,
    ]);
    expect(names).toEqual([{ first_name_th: 'สมหญิง', last_name_th: 'มั่นใจ' }]);
    expect(audits).toEqual([
      {
        first_name_th: 'สมหญิง',
        last_name_th: 'มั่นใจ',
        previous_first_name_th: 'สมชาย',
        previous_last_name_th: 'เดิมดี',
        reason: 'แก้ไขตามหลักฐานทะเบียน',
        resulting_version: 2,
      },
    ]);
    expect(outbox).toEqual([
      {
        event_type: 'public_profile_cache_invalidated',
        payload: { publicId: NAME_PROFILE_PUBLIC_ID },
      },
    ]);

    await expect(
      repository.correctStudentName({
        ...input,
        expectedVersion: 2,
        firstNameTh: 'สมพร',
        idempotencyKey: SECOND_NAME_IDEMPOTENCY_KEY,
      }),
    ).resolves.toMatchObject({ outcome: 'updated', student: { firstNameTh: 'สมพร', version: 3 } });
    await expect(repository.correctStudentName(input)).resolves.toMatchObject({
      outcome: 'replayed',
      student: { firstNameTh: 'สมหญิง', lastNameTh: 'มั่นใจ', version: 2 },
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
    const adminProvisioning = new AdminProvisioningService(
      { adminLoginExists: jest.fn(), createAdminAccount: jest.fn() },
      { createIdentity: jest.fn(), deleteIdentity: jest.fn() },
      { now: () => NOW },
      identityProtector,
      tokenGenerator,
    );
    const controls = new AccountControlsService(
      repository,
      passwordProvider,
      { now: () => NOW },
      identityProtector,
      tokenGenerator,
      adminProvisioning,
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

    const authenticate = jest.fn().mockResolvedValue({
      accessToken: 'provider-access-token-after-reset',
      expiresAt: new Date(NOW.getTime() + 60 * 60 * 1_000),
      providerUserId: STUDENT_PROVIDER_USER_ID,
      refreshToken: 'provider-refresh-token-after-reset',
    });
    const authProvider: AuthProvider = {
      authenticate,
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

    expect(authenticate).toHaveBeenCalledWith(`${STUDENT_ID_HASH}@auth.invalid`, temporaryPassword);
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
          ${CONCURRENT_YEAR_IDEMPOTENCY_KEY},
          ${NAME_IDEMPOTENCY_KEY},
          ${SECOND_NAME_IDEMPOTENCY_KEY}
        )
      `;
      await transaction`
        delete from private.person_name_correction_audit_events
        where student_account_id = ${NAME_STUDENT_ACCOUNT_ID}
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
        delete from private.admin_status_change_audit_events
        where admin_account_id in (${ADMIN_ACCOUNT_ID}, ${SECOND_ADMIN_ACCOUNT_ID})
      `;
      await transaction`
        delete from private.student_status_change_audit_events
        where student_account_id = ${STATUS_STUDENT_ACCOUNT_ID}
      `;
      await transaction`
        delete from private.instructor_role_change_audit_events
        where instructor_account_id in (${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${SUSPENDED_STAFF_ACCOUNT_ID})
      `;
      await transaction`
        delete from private.authentication_audit_events
        where account_id in (
          ${ADMIN_ACCOUNT_ID}, ${SECOND_ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID},
          ${STATUS_STUDENT_ACCOUNT_ID}, ${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${SUSPENDED_STAFF_ACCOUNT_ID}
        )
      `;
      await transaction`
        delete from private.authentication_sessions
        where account_id in (
          ${ADMIN_ACCOUNT_ID}, ${SECOND_ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID},
          ${STATUS_STUDENT_ACCOUNT_ID}, ${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${SUSPENDED_STAFF_ACCOUNT_ID}
        )
      `;
      await transaction`
        delete from private.authentication_rate_limits
        where key_hash in (${STUDENT_ID_HASH}, ${'9'.repeat(64)})
      `;
      await transaction`
        delete from private.student_auth_identities where account_id = ${STUDENT_ACCOUNT_ID}
      `;
      await transaction`
        delete from private.admin_auth_identities
        where account_id in (${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${SUSPENDED_STAFF_ACCOUNT_ID})
      `;
      await transaction`
        delete from public.profile_consents where person_id = ${NAME_STUDENT_PERSON_ID}
      `;
      await transaction`
        delete from public.public_profiles where person_id = ${NAME_STUDENT_PERSON_ID}
      `;
      await transaction`
        delete from private.person_names
        where person_id in (
          ${ADMIN_PERSON_ID}, ${SECOND_ADMIN_PERSON_ID}, ${STUDENT_PERSON_ID},
          ${NAME_STUDENT_PERSON_ID}, ${STATUS_STUDENT_PERSON_ID},
          ${INSTRUCTOR_ELIGIBLE_PERSON_ID}, ${SUSPENDED_STAFF_PERSON_ID}
        )
      `;
      await transaction`
        delete from public.account_roles
        where account_id in (
          ${ADMIN_ACCOUNT_ID}, ${SECOND_ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID},
          ${NAME_STUDENT_ACCOUNT_ID}, ${STATUS_STUDENT_ACCOUNT_ID},
          ${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${SUSPENDED_STAFF_ACCOUNT_ID}
        )
      `;
      await transaction`
        update public.academic_settings
        set updated_by_account_id = null
        where updated_by_account_id = ${ADMIN_ACCOUNT_ID}
      `;
      await transaction`
        delete from public.accounts
        where id in (
          ${ADMIN_ACCOUNT_ID}, ${SECOND_ADMIN_ACCOUNT_ID}, ${STUDENT_ACCOUNT_ID},
          ${NAME_STUDENT_ACCOUNT_ID}, ${STATUS_STUDENT_ACCOUNT_ID},
          ${INSTRUCTOR_ELIGIBLE_ACCOUNT_ID}, ${SUSPENDED_STAFF_ACCOUNT_ID}
        )
      `;
      await transaction`
        delete from public.students
        where person_id in (
          ${STUDENT_PERSON_ID}, ${NAME_STUDENT_PERSON_ID}, ${STATUS_STUDENT_PERSON_ID}
        )
      `;
      await transaction`
        delete from public.people
        where id in (
          ${ADMIN_PERSON_ID}, ${SECOND_ADMIN_PERSON_ID}, ${STUDENT_PERSON_ID},
          ${NAME_STUDENT_PERSON_ID}, ${STATUS_STUDENT_PERSON_ID},
          ${INSTRUCTOR_ELIGIBLE_PERSON_ID}, ${SUSPENDED_STAFF_PERSON_ID}
        )
      `;
    });
  }
});
