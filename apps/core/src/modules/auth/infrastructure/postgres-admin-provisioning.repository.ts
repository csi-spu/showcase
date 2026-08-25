import { Injectable } from '@nestjs/common';
import type { AdminProvisioningRepository } from '../application/admin-provisioning.ports';
import { DatabaseClient } from './database.client';

@Injectable()
export class PostgresAdminProvisioningRepository implements AdminProvisioningRepository {
  constructor(private readonly database: DatabaseClient) {}

  createAdminAccount(input: {
    adminLoginHash: string;
    now: Date;
    providerUserId: string;
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
      const account = accounts[0];
      if (account === undefined) {
        throw new Error('ADMIN_ACCOUNT_WRITE_FAILED');
      }
      await transaction`
        insert into public.account_roles (account_id, role, created_at)
        values (${account.id}, 'admin', ${input.now})
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
      await transaction`
        insert into private.authentication_audit_events (
          account_id,
          event_type,
          occurred_at
        ) values (${account.id}, 'admin_provisioned', ${input.now})
      `;
      return { accountId: account.id };
    });
  }
}
