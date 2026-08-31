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
        studentIdPrefixHashes: firstClaim[0]!.studentIdPrefixHashes,
        syntheticIdentity: SYNTHETIC_IDENTITY,
      }),
    ).resolves.toBe('created');

    await database.sql`
      delete from private.student_id_search_prefixes
      where account_id = (
        select id from public.accounts where provider_user_id = ${STUDENT_PROVIDER_USER_ID}
      )
    `;

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
    await expect(
      repository.settleExistingRow({
        batchId: secondBatch.batchId,
        now: new Date(NOW.getTime() + 1_000),
        rowId: secondClaim[0]!.rowId,
        studentIdHash: STUDENT_ID_HASH,
        studentIdPrefixHashes: secondClaim[0]!.studentIdPrefixHashes,
      }),
    ).resolves.toBe('unchanged');

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
    const prefixes = await database.sql<{ count: number }[]>`
      select count(*)::integer as count
      from private.student_id_search_prefixes as prefix
      join public.accounts as account on account.id = prefix.account_id
      where account.provider_user_id = ${STUDENT_PROVIDER_USER_ID}
    `;
    expect(prefixes).toEqual([{ count: 7 }]);
  });

  it('persists and reports distinct Entry Years for a multi-cohort Batch', async () => {
    const batch = await repository.createBatch({
      ...batchInput(),
      rows: [
        { ...batchInput().rows[0]!, entryYear: 2566, studentId: '66000001' },
        {
          ...batchInput().rows[0]!,
          entryYear: 2570,
          providerUserId: '70000000-0000-5000-8000-000000000001',
          rowNumber: 3,
          studentId: '70000001',
          studentIdHash: 'b'.repeat(64),
          syntheticIdentity: `${'b'.repeat(64)}@auth.invalid`,
        },
      ],
    });

    await expect(repository.getBatch(batch.batchId)).resolves.toMatchObject({
      entryYears: [2566, 2570],
      totalRowCount: 2,
    });
    await expect(
      repository.claimRows({
        leaseUntil: new Date(NOW.getTime() + 60_000),
        limit: 100,
        now: NOW,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ entryYear: 2566, studentId: '66000001' }),
      expect.objectContaining({ entryYear: 2570, studentId: '70000001' }),
    ]);
  });

  it('persists every duplicate occurrence as a stable row error while valid rows remain claimable', async () => {
    const batch = await repository.createBatch({
      ...batchInput(),
      rows: [
        batchInput().rows[0]!,
        { errorCode: 'DUPLICATE_STUDENT_ID', rowNumber: 3, studentId: '69000002' },
        { errorCode: 'DUPLICATE_STUDENT_ID', rowNumber: 4, studentId: '69000002' },
      ],
    });

    await expect(repository.getBatch(batch.batchId)).resolves.toMatchObject({
      entryYears: [2569],
      failedCount: 2,
      processedRowCount: 2,
      status: 'pending',
      totalRowCount: 3,
    });
    await expect(repository.getErrorRows(batch.batchId)).resolves.toEqual([
      { errorCode: 'DUPLICATE_STUDENT_ID', rowNumber: 3, studentId: '69000002' },
      { errorCode: 'DUPLICATE_STUDENT_ID', rowNumber: 4, studentId: '69000002' },
    ]);
    await expect(
      repository.claimRows({
        leaseUntil: new Date(NOW.getTime() + 60_000),
        limit: 100,
        now: NOW,
      }),
    ).resolves.toEqual([expect.objectContaining({ rowNumber: 2, studentId: '69000001' })]);
  });

  it('completes an all-invalid Batch immediately with an empty Entry Year summary', async () => {
    const batch = await repository.createBatch({
      now: NOW,
      rows: [
        { errorCode: 'INVALID_STUDENT_ID', rowNumber: 2, studentId: 'not-an-id' },
        { errorCode: 'INVALID_FIRST_NAME', rowNumber: 3, studentId: '69000002' },
      ],
      uploaderAccountId: adminAccountId,
    });

    expect(batch).toMatchObject({
      entryYears: [],
      failedCount: 2,
      processedRowCount: 2,
      status: 'completed_with_errors',
      totalRowCount: 2,
    });
    await expect(
      repository.claimRows({
        leaseUntil: new Date(NOW.getTime() + 60_000),
        limit: 100,
        now: NOW,
      }),
    ).resolves.toEqual([]);
    const expiredAt = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1_000);
    await expect(repository.deleteExpiredRowContent({ limit: 1, now: expiredAt })).resolves.toBe(1);
    await expect(repository.getErrorRows(batch.batchId)).resolves.toHaveLength(1);
    await expect(repository.deleteExpiredRowContent({ limit: 1, now: expiredAt })).resolves.toBe(1);
  });

  it('rejects an unsorted cohort summary at the database boundary', async () => {
    await expect(
      database.sql`
        insert into private.roster_batches (
          uploader_account_id, entry_years, total_row_count, uploaded_at
        ) values (${adminAccountId}, ${[2570, 2566]}, 1, ${NOW})
      `,
    ).rejects.toThrow();
  });

  it('creates and idempotently resolves an audited name conflict without reassigning identity', async () => {
    const firstBatch = await repository.createBatch(batchInput());
    const firstClaim = await repository.claimRows({
      leaseUntil: new Date(NOW.getTime() + 60_000),
      limit: 1,
      now: NOW,
    });
    await repository.completeProvisioning({
      batchId: firstBatch.batchId,
      entryYear: 2569,
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      now: NOW,
      providerUserId: STUDENT_PROVIDER_USER_ID,
      rowId: firstClaim[0]!.rowId,
      studentIdHash: STUDENT_ID_HASH,
      studentIdPrefixHashes: firstClaim[0]!.studentIdPrefixHashes,
      syntheticIdentity: SYNTHETIC_IDENTITY,
    });
    const existing = await repository.findExistingStudent(STUDENT_ID_HASH);

    const conflictBatch = await repository.createBatch({
      ...batchInput(),
      now: new Date(NOW.getTime() + 1_000),
      rows: [
        {
          ...batchInput().rows[0]!,
          firstNameTh: 'สมหญิง',
          lastNameTh: 'มั่นคง',
        },
      ],
    });
    const conflictClaim = await repository.claimRows({
      leaseUntil: new Date(NOW.getTime() + 61_000),
      limit: 1,
      now: new Date(NOW.getTime() + 1_000),
    });

    await expect(
      repository.settleExistingRow({
        batchId: conflictBatch.batchId,
        now: new Date(NOW.getTime() + 1_000),
        rowId: conflictClaim[0]!.rowId,
        studentIdHash: STUDENT_ID_HASH,
        studentIdPrefixHashes: conflictClaim[0]!.studentIdPrefixHashes,
      }),
    ).resolves.toBe('conflict');
    const page = await repository.listConflicts({
      afterRowNumber: null,
      batchId: conflictBatch.batchId,
      limit: 50,
    });
    expect(page).toMatchObject({
      conflicts: [
        {
          existingFirstNameTh: 'สมชาย',
          incomingFirstNameTh: 'สมหญิง',
          rowNumber: 2,
          status: 'pending',
          version: 1,
        },
      ],
      nextAfterRowNumber: null,
    });

    const conflictId = page.conflicts[0]!.conflictId;
    const profiles = await database.sql<{ public_id: string }[]>`
      insert into public.public_profiles (person_id, bio, version)
      values (${existing!.personId}, null, 1)
      returning public_id
    `;
    await database.sql`
      insert into public.profile_consents (person_id, consent_text_version, granted_at)
      values (${existing!.personId}, 'phase-1-v1', ${NOW})
    `;
    const resolution = {
      actorAccountId: adminAccountId,
      conflictId,
      expectedVersion: 1,
      idempotencyKey: '30000000-0000-4000-8000-000000000001',
      now: new Date(NOW.getTime() + 2_000),
      reason: 'ตรวจสอบกับทะเบียนแล้ว',
      resolution: 'accept_incoming_name' as const,
    };
    await expect(repository.resolveConflict(resolution)).resolves.toMatchObject({
      conflict: { status: 'resolved', version: 2 },
      outcome: 'resolved',
    });
    await expect(repository.resolveConflict(resolution)).resolves.toMatchObject({
      conflict: { status: 'resolved', version: 2 },
      outcome: 'replayed',
    });
    await expect(
      repository.resolveConflict({
        ...resolution,
        idempotencyKey: '30000000-0000-4000-8000-000000000002',
        resolution: 'keep_existing',
      }),
    ).resolves.toEqual({ outcome: 'version_conflict' });
    await expect(repository.findExistingStudent(STUDENT_ID_HASH)).resolves.toMatchObject({
      firstNameTh: 'สมหญิง',
      lastNameTh: 'มั่นคง',
      personId: existing!.personId,
    });
    const accountVersions = await database.sql<{ control_version: number }[]>`
      select control_version
      from public.accounts
      where person_id = ${existing!.personId}
    `;
    expect(accountVersions).toEqual([{ control_version: 2 }]);
    const audits = await database.sql<{ count: number }[]>`
      select count(*)::integer as count
      from private.roster_conflict_resolution_audit_events
      where conflict_id = ${conflictId}
    `;
    expect(audits).toEqual([{ count: 1 }]);
    const profileOutbox = await database.sql<
      { event_type: string; payload: { publicId: string } }[]
    >`
      select event_type, payload
      from private.outbox_events
      where aggregate_type = 'public_profile'
        and aggregate_id = ${resolution.idempotencyKey}
    `;
    expect(profileOutbox).toEqual([
      {
        event_type: 'public_profile_cache_invalidated',
        payload: { publicId: profiles[0]!.public_id },
      },
    ]);

    const keepBatch = await repository.createBatch({
      ...batchInput(),
      now: new Date(NOW.getTime() + 3_000),
      rows: [
        {
          ...batchInput().rows[0]!,
          firstNameTh: 'สมปอง',
          lastNameTh: 'กล้าหาญ',
        },
      ],
    });
    const keepClaim = await repository.claimRows({
      leaseUntil: new Date(NOW.getTime() + 63_000),
      limit: 1,
      now: new Date(NOW.getTime() + 3_000),
    });
    await repository.settleExistingRow({
      batchId: keepBatch.batchId,
      now: new Date(NOW.getTime() + 3_000),
      rowId: keepClaim[0]!.rowId,
      studentIdHash: STUDENT_ID_HASH,
      studentIdPrefixHashes: keepClaim[0]!.studentIdPrefixHashes,
    });
    const keepPage = await repository.listConflicts({
      afterRowNumber: null,
      batchId: keepBatch.batchId,
      limit: 50,
    });
    await expect(
      repository.resolveConflict({
        actorAccountId: adminAccountId,
        conflictId: keepPage.conflicts[0]!.conflictId,
        expectedVersion: 1,
        idempotencyKey: '30000000-0000-4000-8000-000000000003',
        now: new Date(NOW.getTime() + 4_000),
        reason: null,
        resolution: 'keep_existing',
      }),
    ).resolves.toMatchObject({
      conflict: { resolution: 'keep_existing', status: 'resolved', version: 2 },
      outcome: 'resolved',
    });
    await expect(repository.findExistingStudent(STUDENT_ID_HASH)).resolves.toMatchObject({
      firstNameTh: 'สมหญิง',
      lastNameTh: 'มั่นคง',
      personId: existing!.personId,
    });
    await repository.deleteExpiredRowContent({
      limit: 1_000,
      now: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1_000 + 5_000),
    });
    await expect(
      repository.listConflicts({
        afterRowNumber: null,
        batchId: keepBatch.batchId,
        limit: 50,
      }),
    ).resolves.toMatchObject({
      conflicts: [{ resolution: 'keep_existing', status: 'resolved' }],
    });
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
      repository.listErrorRows({ afterRowNumber: null, batchId: batch.batchId, limit: 50 }),
    ).resolves.toEqual({
      errors: [
        {
          attemptCount: 3,
          errorCode: 'ROSTER_AUTH_PROVIDER_UNAVAILABLE',
          errorMessageTh: 'ไม่สามารถสร้างบัญชียืนยันตัวตนได้หลังลองครบจำนวน',
          retryState: 'exhausted',
          rowNumber: 2,
          studentId: '69000001',
        },
      ],
      nextAfterRowNumber: null,
    });

    await expect(
      repository.deleteExpiredRowContent({
        limit: 1_000,
        now: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1_000),
      }),
    ).resolves.toBe(1);
    await expect(repository.getBatch(batch.batchId)).resolves.toMatchObject({
      entryYears: [2569],
      failedCount: 1,
      status: 'completed_with_errors',
      totalRowCount: 1,
    });
    await expect(repository.getErrorRows(batch.batchId)).resolves.toEqual([]);
  });

  function batchInput(): CreateRosterBatchInput {
    return {
      now: NOW,
      rows: [
        {
          entryYear: 2569,
          firstNameTh: 'สมชาย',
          lastNameTh: 'ใจดี',
          providerUserId: STUDENT_PROVIDER_USER_ID,
          rowNumber: 2,
          studentId: '69000001',
          studentIdHash: STUDENT_ID_HASH,
          studentIdPrefixHashes: Array.from({ length: 7 }, (_, index) =>
            String(index + 1).repeat(64),
          ),
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
        delete from private.outbox_events
        where aggregate_type = 'public_profile'
          and aggregate_id in (
            '30000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000002'
          )
      `;
      await transaction`
        delete from private.roster_conflict_resolution_audit_events
        where batch_id in (
          select roster_batch.id from private.roster_batches as roster_batch
          join public.accounts as account on account.id = roster_batch.uploader_account_id
          where account.provider_user_id = ${ADMIN_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from private.roster_conflicts
        where batch_id in (
          select roster_batch.id from private.roster_batches as roster_batch
          join public.accounts as account on account.id = roster_batch.uploader_account_id
          where account.provider_user_id = ${ADMIN_PROVIDER_USER_ID}
        )
      `;
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
        delete from public.profile_consents
        where person_id in (
          select person_id from public.accounts where provider_user_id = ${STUDENT_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from public.public_profiles
        where person_id in (
          select person_id from public.accounts where provider_user_id = ${STUDENT_PROVIDER_USER_ID}
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
