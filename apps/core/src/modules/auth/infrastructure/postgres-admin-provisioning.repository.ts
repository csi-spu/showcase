import { Injectable } from '@nestjs/common';
import {
  AdminLoginTakenError,
  type AdminProvisioningRepository,
} from '../application/admin-provisioning.ports';
import { DatabaseClient } from './database.client';

@Injectable()
export class PostgresAdminProvisioningRepository implements AdminProvisioningRepository {
  constructor(private readonly database: DatabaseClient) {}

  async adminLoginExists(adminLoginHash: string): Promise<boolean> {
    const rows = await this.database.sql<{ exists: boolean }[]>`
      select exists (
        select 1 from private.admin_auth_identities where admin_login_hash = ${adminLoginHash}
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  createAdminAccount(input: {
    adminLoginHash: string;
    firstNameTh: string;
    lastNameTh: string;
    now: Date;
    providerUserId: string;
    role: 'admin' | 'instructor';
    syntheticIdentity: string;
  }): Promise<{ accountId: string }> {
    return this.database.sql.begin(async (transaction) => {
      const people = await transaction<{ id: string }[]>`
        insert into public.people (created_at) values (${input.now}) returning id
      `;
      const person = people[0];
      if (person === undefined) {
        throw new Error('ADMIN_PERSON_WRITE_FAILED');
      }
      await transaction`
        insert into private.person_names (
          person_id,
          first_name_th,
          last_name_th,
          created_at,
          updated_at
        ) values (
          ${person.id},
          ${input.firstNameTh},
          ${input.lastNameTh},
          ${input.now},
          ${input.now}
        )
      `;
      let account: { id: string } | undefined;
      try {
        const accounts = await transaction<{ id: string }[]>`
          insert into public.accounts (
            person_id,
            provider_user_id,
            credential_state,
            created_at,
            updated_at
          ) values (
            ${person.id},
            ${input.providerUserId},
            'initial',
            ${input.now},
            ${input.now}
          )
          returning id
        `;
        account = accounts[0];
        if (account === undefined) {
          throw new Error('ADMIN_ACCOUNT_WRITE_FAILED');
        }
        await transaction`
          insert into public.account_roles (account_id, role, created_at)
          values (${account.id}, ${input.role}, ${input.now})
        `;
        await transaction`
          insert into private.admin_auth_identities (
            account_id,
            admin_login_hash,
            synthetic_identity,
            created_at
          ) values (
            ${account.id},
            ${input.adminLoginHash},
            ${input.syntheticIdentity},
            ${input.now}
          )
        `;
      } catch (error: unknown) {
        if (
          isUniqueViolation(error, 'admin_login_hash') ||
          isUniqueViolation(error, 'synthetic_identity') ||
          isUniqueViolation(error, 'provider_user_id')
        ) {
          throw new AdminLoginTakenError();
        }
        throw error;
      }
      await transaction`
        insert into private.authentication_audit_events (
          account_id,
          event_type,
          occurred_at
        ) values (${account.id}, ${`${input.role}_provisioned`}, ${input.now})
      `;
      return { accountId: account.id };
    });
  }
}

function isUniqueViolation(error: unknown, columnName: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: unknown }).code === '23505' &&
    error.message.includes(`(${columnName})=`)
  );
}
