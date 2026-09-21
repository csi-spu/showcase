import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { AdminLoginTakenError } from '../src/modules/auth/application/admin-provisioning.ports';
import { PostgresAdminProvisioningRepository } from '../src/modules/auth/infrastructure/postgres-admin-provisioning.repository';
import { PostgresAuthRepository } from '../src/modules/auth/infrastructure/postgres-auth.repository';

const ADMIN_LOGIN_HASH = '7'.repeat(64);
const SYNTHETIC_IDENTITY = `${ADMIN_LOGIN_HASH}@admin.auth.invalid`;
const PROVIDER_USER_ID = '50000000-0000-4000-8000-000000000001';
const SECOND_PROVIDER_USER_ID = '50000000-0000-4000-8000-000000000002';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresAdminProvisioningRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresAdminProvisioningRepository(database);
  const authRepository = new PostgresAuthRepository(database);

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('creates Person, Account, Admin role, private identity, name, and audit atomically', async () => {
    const result = await repository.createAdminAccount({
      adminLoginHash: ADMIN_LOGIN_HASH,
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      now: new Date('2026-08-25T04:00:00.000Z'),
      providerUserId: PROVIDER_USER_ID,
      role: 'admin',
      syntheticIdentity: SYNTHETIC_IDENTITY,
    });

    await expect(authRepository.findAdminLoginAccount(ADMIN_LOGIN_HASH)).resolves.toMatchObject({
      accountId: result.accountId,
      credentialState: 'initial',
      hasAdminRole: true,
      providerUserId: PROVIDER_USER_ID,
    });
    const audits = await database.sql<{ event_type: string }[]>`
      select event_type from private.authentication_audit_events
      where account_id = ${result.accountId}
    `;
    expect(audits).toEqual([{ event_type: 'admin_provisioned' }]);
    const names = await database.sql<{ first_name_th: string; last_name_th: string }[]>`
      select person_name.first_name_th, person_name.last_name_th
      from private.person_names as person_name
      join public.accounts as account on account.person_id = person_name.person_id
      where account.id = ${result.accountId}
    `;
    expect(names).toEqual([{ first_name_th: 'สมชาย', last_name_th: 'ใจดี' }]);
  });

  it('reports admin login existence before and after provisioning', async () => {
    await expect(repository.adminLoginExists(ADMIN_LOGIN_HASH)).resolves.toBe(false);
    await repository.createAdminAccount({
      adminLoginHash: ADMIN_LOGIN_HASH,
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      now: new Date('2026-08-25T04:00:00.000Z'),
      providerUserId: PROVIDER_USER_ID,
      role: 'admin',
      syntheticIdentity: SYNTHETIC_IDENTITY,
    });
    await expect(repository.adminLoginExists(ADMIN_LOGIN_HASH)).resolves.toBe(true);
  });

  it('rolls back every application row when the private login identity conflicts, even when the identity provider treats the retry as idempotent', async () => {
    await repository.createAdminAccount({
      adminLoginHash: ADMIN_LOGIN_HASH,
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      now: new Date('2026-08-25T04:00:00.000Z'),
      providerUserId: PROVIDER_USER_ID,
      role: 'admin',
      syntheticIdentity: SYNTHETIC_IDENTITY,
    });

    await expect(
      repository.createAdminAccount({
        adminLoginHash: ADMIN_LOGIN_HASH,
        firstNameTh: 'วิชัย',
        lastNameTh: 'มั่นคง',
        now: new Date('2026-08-25T04:01:00.000Z'),
        // A real identity provider may return the same provider user id for a
        // retried login instead of erroring, so this reproduces that case too.
        providerUserId: PROVIDER_USER_ID,
        role: 'admin',
        syntheticIdentity: SYNTHETIC_IDENTITY,
      }),
    ).rejects.toBeInstanceOf(AdminLoginTakenError);
    const secondAccounts = await database.sql<{ count: number }[]>`
      select count(*)::integer as count from public.accounts
      where provider_user_id = ${SECOND_PROVIDER_USER_ID}
    `;
    expect(secondAccounts).toEqual([{ count: 0 }]);
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.authentication_audit_events
        where account_id in (
          select id from public.accounts
          where provider_user_id in (${PROVIDER_USER_ID}, ${SECOND_PROVIDER_USER_ID})
        )
      `;
      await transaction`
        delete from private.admin_auth_identities
        where account_id in (
          select id from public.accounts
          where provider_user_id in (${PROVIDER_USER_ID}, ${SECOND_PROVIDER_USER_ID})
        )
      `;
      await transaction`
        delete from public.account_roles
        where account_id in (
          select id from public.accounts
          where provider_user_id in (${PROVIDER_USER_ID}, ${SECOND_PROVIDER_USER_ID})
        )
      `;
      const people = await transaction<{ person_id: string }[]>`
        select person_id from public.accounts
        where provider_user_id in (${PROVIDER_USER_ID}, ${SECOND_PROVIDER_USER_ID})
      `;
      await transaction`
        delete from public.accounts
        where provider_user_id in (${PROVIDER_USER_ID}, ${SECOND_PROVIDER_USER_ID})
      `;
      for (const person of people) {
        await transaction`delete from private.person_names where person_id = ${person.person_id}`;
        await transaction`delete from public.people where id = ${person.person_id}`;
      }
    });
  }
});
