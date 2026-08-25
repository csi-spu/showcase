import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
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

  it('creates Person, Account, Admin role, private identity, and audit atomically', async () => {
    const result = await repository.createAdminAccount({
      adminLoginHash: ADMIN_LOGIN_HASH,
      now: new Date('2026-08-25T04:00:00.000Z'),
      providerUserId: PROVIDER_USER_ID,
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
  });

  it('rolls back every application row when the private login identity conflicts', async () => {
    await repository.createAdminAccount({
      adminLoginHash: ADMIN_LOGIN_HASH,
      now: new Date('2026-08-25T04:00:00.000Z'),
      providerUserId: PROVIDER_USER_ID,
      syntheticIdentity: SYNTHETIC_IDENTITY,
    });

    await expect(
      repository.createAdminAccount({
        adminLoginHash: ADMIN_LOGIN_HASH,
        now: new Date('2026-08-25T04:01:00.000Z'),
        providerUserId: SECOND_PROVIDER_USER_ID,
        syntheticIdentity: `${'8'.repeat(64)}@admin.auth.invalid`,
      }),
    ).rejects.toBeDefined();
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
        await transaction`delete from public.people where id = ${person.person_id}`;
      }
    });
  }
});
