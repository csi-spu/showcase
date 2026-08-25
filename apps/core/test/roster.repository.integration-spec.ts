import { ConfigService } from '@nestjs/config';
import type { CreateRosterBatchInput } from '../src/modules/roster/application/roster.ports';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresRosterRepository } from '../src/modules/roster/infrastructure/postgres-roster.repository';

const ADMIN_PROVIDER_USER_ID = '61000000-0000-4000-8000-000000000001';
const STUDENT_PROVIDER_USER_ID = '69000000-0000-5000-8000-000000000001';
const STUDENT_ID_HASH = 'a'.repeat(64);
const SYNTHETIC_IDENTITY = `${STUDENT_ID_HASH}@auth.invalid`;
const NOW = new Date('2026-08-25T06:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresRosterRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresRosterRepository(database);
  let adminAccountId: string;

  beforeEach(async () => {
    await cleanup();
    const people = await database.sql<{ id: string }[]>`
      insert into public.people (created_at) values (${NOW}) returning id
    `;
    const person = people[0];
    if (person === undefined) throw new Error('ADMIN_FIXTURE_FAILED');
    const accounts = await database.sql<{ id: string }[]>`
      insert into public.accounts (
        person_id, provider_user_id, credential_state, created_at, updated_at
      ) values (
        ${person.id}, ${ADMIN_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}
      ) returning id
    `;
    const account = accounts[0];
    if (account === undefined) throw new Error('ADMIN_FIXTURE_FAILED');
    adminAccountId = account.id;
    await database.sql`
      insert into public.account_roles (account_id, role, created_at)
      values (${adminAccountId}, 'admin', ${NOW})
    `;
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('atomically creates the Batch and converges an equivalent reimport without duplicates', async () => {
    const firstBatch = await repository.createBatch(batchInput());
    expect(firstBatch).toMatchObject({ status: 'pending', totalRowCount: 1 });
    const firstClaim = await repository.claimRows({
      leaseUntil: new Date(NOW.getTime() + 60_000),
      limit: 100,
      now: NOW,
    });
    expect(firstClaim).toHaveLength(1);
    await expect(
      repository.completeProvisioning({
        batchId: firstBatch.batchId,
        entryYear: 2569,
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
        now: NOW,
        providerUserId: STUDENT_PROVIDER_USER_ID,
        rowId: firstClaim[0]!.rowId,
        studentIdHash: STUDENT_ID_HASH,
        syntheticIdentity: SYNTHETIC_IDENTITY,
      }),
    ).resolves.toBe('created');

    const secondBatch = await repository.createBatch({
      ...batchInput(),
      now: new Date(NOW.getTime() + 1_000),
    });
    const secondClaim = await repository.claimRows({
      leaseUntil: new Date(NOW.getTime() + 61_000),
      limit: 100,
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(secondClaim).toHaveLength(1);
    await expect(repository.findExistingStudent(STUDENT_ID_HASH)).resolves.toEqual({
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
    });
    await repository.markUnchanged({
      batchId: secondBatch.batchId,
      now: new Date(NOW.getTime() + 1_000),
      rowId: secondClaim[0]!.rowId,
    });

    await expect(repository.getBatch(firstBatch.batchId)).resolves.toMatchObject({
      createdCount: 1,
      status: 'completed',
    });
    await expect(repository.getBatch(secondBatch.batchId)).resolves.toMatchObject({
      status: 'completed',
      unchangedCount: 1,
    });
    const records = await database.sql<{ accounts: number; people: number; students: number }[]>`
      select
        (select count(*)::integer from public.accounts
          where provider_user_id = ${STUDENT_PROVIDER_USER_ID}) as accounts,
        (select count(*)::integer from public.people as person
          join public.accounts as account on account.person_id = person.id
          where account.provider_user_id = ${STUDENT_PROVIDER_USER_ID}) as people,
        (select count(*)::integer from public.students as student
          join public.accounts as account on account.person_id = student.person_id
          where account.provider_user_id = ${STUDENT_PROVIDER_USER_ID}) as students
    `;
    expect(records).toEqual([{ accounts: 1, people: 1, students: 1 }]);
    const outbox = await database.sql<{ count: number }[]>`
      select count(*)::integer as count from private.outbox_events
      where aggregate_id in (${firstBatch.batchId}, ${secondBatch.batchId})
        and event_type = 'roster_batch_completed'
    `;
    expect(outbox).toEqual([{ count: 2 }]);
  });

  it('retains safe Batch counts while deleting private row content after 30 days', async () => {
    const batch = await repository.createBatch(batchInput());
    const claim = await repository.claimRows({
      leaseUntil: new Date(NOW.getTime() + 60_000),
      limit: 1,
      now: NOW,
    });
    await repository.recordFailure({
      attemptCount: 3,
      batchId: batch.batchId,
      errorCode: 'ROSTER_AUTH_PROVIDER_UNAVAILABLE',
      nextAttemptAt: NOW,
      now: NOW,
      rowId: claim[0]!.rowId,
    });

    await expect(
      repository.deleteExpiredRowContent(new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1_000)),
    ).resolves.toBe(1);
    await expect(repository.getBatch(batch.batchId)).resolves.toMatchObject({
      failedCount: 1,
      status: 'completed_with_errors',
      totalRowCount: 1,
    });
  });

  function batchInput(): CreateRosterBatchInput {
    return {
      entryYear: 2569,
      now: NOW,
      rows: [
        {
          firstNameTh: 'สมชาย',
          lastNameTh: 'ใจดี',
          providerUserId: STUDENT_PROVIDER_USER_ID,
          rowNumber: 2,
          studentId: '69000001',
          studentIdHash: STUDENT_ID_HASH,
          syntheticIdentity: SYNTHETIC_IDENTITY,
        },
      ],
      uploaderAccountId: adminAccountId,
    };
  }

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`delete from private.outbox_events where aggregate_type = 'roster_batch'`;
      await transaction`
        delete from private.roster_audit_events
        where batch_id in (
          select roster_batch.id from private.roster_batches as roster_batch
          join public.accounts as account on account.id = roster_batch.uploader_account_id
          where account.provider_user_id = ${ADMIN_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from private.roster_batches
        where uploader_account_id in (
          select id from public.accounts where provider_user_id = ${ADMIN_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from private.authentication_audit_events
        where account_id in (
          select id from public.accounts
          where provider_user_id in (${ADMIN_PROVIDER_USER_ID}, ${STUDENT_PROVIDER_USER_ID})
        )
      `;
      await transaction`
        delete from private.student_auth_identities
        where account_id in (
          select id from public.accounts where provider_user_id = ${STUDENT_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from private.person_names
        where person_id in (
          select person_id from public.accounts
          where provider_user_id in (${ADMIN_PROVIDER_USER_ID}, ${STUDENT_PROVIDER_USER_ID})
        )
      `;
      await transaction`
        delete from public.account_roles
        where account_id in (
          select id from public.accounts
          where provider_user_id in (${ADMIN_PROVIDER_USER_ID}, ${STUDENT_PROVIDER_USER_ID})
        )
      `;
      await transaction`
        delete from public.students
        where person_id in (
          select person_id from public.accounts where provider_user_id = ${STUDENT_PROVIDER_USER_ID}
        )
      `;
      const people = await transaction<{ person_id: string }[]>`
        select person_id from public.accounts
        where provider_user_id in (${ADMIN_PROVIDER_USER_ID}, ${STUDENT_PROVIDER_USER_ID})
      `;
      await transaction`
        delete from public.accounts
        where provider_user_id in (${ADMIN_PROVIDER_USER_ID}, ${STUDENT_PROVIDER_USER_ID})
      `;
      for (const person of people) {
        await transaction`delete from public.people where id = ${person.person_id}`;
      }
    });
  }
});
