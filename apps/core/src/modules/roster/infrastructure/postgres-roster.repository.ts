import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  ClaimedRosterRow,
  CreateRosterBatchInput,
  ExistingRosterStudent,
  RosterBatch,
  RosterBatchStatus,
  RosterRepository,
  RosterRowErrorCode,
} from '../application/roster.ports';

interface RosterBatchRow {
  created_count: number;
  entry_year: number;
  failed_count: number;
  id: string;
  processed_row_count: number;
  status: RosterBatchStatus;
  total_row_count: number;
  unchanged_count: number;
  uploaded_at: Date;
}

interface ClaimedRosterRowRecord {
  attempt_count: number;
  batch_id: string;
  entry_year: number;
  first_name_th: string;
  id: string;
  last_name_th: string;
  provider_user_id: string;
  row_number: number;
  student_id: string;
  student_id_hash: string;
  synthetic_identity: string;
}

@Injectable()
export class PostgresRosterRepository implements RosterRepository {
  constructor(private readonly database: DatabaseClient) {}

  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch> {
    return this.database.sql.begin(async (transaction) => {
      const batches = await transaction<RosterBatchRow[]>`
        insert into private.roster_batches (
          uploader_account_id, entry_year, total_row_count, uploaded_at
        ) values (
          ${input.uploaderAccountId}, ${input.entryYear}, ${input.rows.length}, ${input.now}
        )
        returning *
      `;
      const batch = batches[0];
      if (batch === undefined) throw new Error('ROSTER_BATCH_WRITE_FAILED');

      for (let index = 0; index < input.rows.length; index += 500) {
        const records = input.rows.slice(index, index + 500).map((row) => ({
          batch_id: batch.id,
          created_at: input.now,
          first_name_th: row.firstNameTh,
          last_name_th: row.lastNameTh,
          next_attempt_at: input.now,
          provider_user_id: row.providerUserId,
          row_number: row.rowNumber,
          student_id: row.studentId,
          student_id_hash: row.studentIdHash,
          synthetic_identity: row.syntheticIdentity,
          updated_at: input.now,
        }));
        await transaction`
          insert into private.roster_rows ${transaction(
            records,
            'batch_id',
            'created_at',
            'first_name_th',
            'last_name_th',
            'next_attempt_at',
            'provider_user_id',
            'row_number',
            'student_id',
            'student_id_hash',
            'synthetic_identity',
            'updated_at',
          )}
        `;
      }
      await transaction`
        insert into private.roster_audit_events (
          batch_id, actor_account_id, event_type, occurred_at
        ) values (
          ${batch.id}, ${input.uploaderAccountId}, 'roster_batch_created', ${input.now}
        )
      `;
      return this.mapBatch(batch);
    });
  }

  claimRows(input: { leaseUntil: Date; limit: number; now: Date }): Promise<ClaimedRosterRow[]> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<ClaimedRosterRowRecord[]>`
        select
          roster_row.id,
          roster_row.batch_id,
          roster_batch.entry_year,
          roster_row.row_number,
          roster_row.student_id,
          roster_row.student_id_hash,
          roster_row.synthetic_identity,
          roster_row.provider_user_id,
          roster_row.first_name_th,
          roster_row.last_name_th,
          roster_row.attempt_count
        from private.roster_rows as roster_row
        join private.roster_batches as roster_batch on roster_batch.id = roster_row.batch_id
        where (
          roster_row.status = 'pending' and roster_row.next_attempt_at <= ${input.now}
        ) or (
          roster_row.status = 'processing' and roster_row.lease_until <= ${input.now}
        )
        order by roster_row.created_at, roster_row.row_number
        limit ${input.limit}
        for update of roster_row skip locked
      `;
      if (rows.length === 0) return [];
      const rowIds = rows.map((row) => row.id);
      const batchIds = [...new Set(rows.map((row) => row.batch_id))];
      await transaction`
        update private.roster_rows
        set status = 'processing', lease_until = ${input.leaseUntil}, updated_at = ${input.now}
        where id in ${transaction(rowIds)}
      `;
      await transaction`
        update private.roster_batches set status = 'processing'
        where id in ${transaction(batchIds)} and status = 'pending'
      `;
      return rows.map((row) => ({
        attemptCount: row.attempt_count,
        batchId: row.batch_id,
        entryYear: row.entry_year,
        firstNameTh: row.first_name_th,
        lastNameTh: row.last_name_th,
        providerUserId: row.provider_user_id,
        rowId: row.id,
        rowNumber: row.row_number,
        studentId: row.student_id,
        studentIdHash: row.student_id_hash,
        syntheticIdentity: row.synthetic_identity,
      }));
    });
  }

  async findExistingStudent(studentIdHash: string): Promise<ExistingRosterStudent | null> {
    const rows = await this.database.sql<{ first_name_th: string; last_name_th: string }[]>`
      select person_name.first_name_th, person_name.last_name_th
      from private.student_auth_identities as identity
      join public.accounts as account on account.id = identity.account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      where identity.student_id_hash = ${studentIdHash}
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : { firstNameTh: row.first_name_th, lastNameTh: row.last_name_th };
  }

  completeProvisioning(input: {
    batchId: string;
    entryYear: number;
    firstNameTh: string;
    lastNameTh: string;
    now: Date;
    providerUserId: string;
    rowId: string;
    studentIdHash: string;
    syntheticIdentity: string;
  }): Promise<'created' | 'unchanged'> {
    return this.database.sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.studentIdHash}, 0))`;
      const existing = await this.findExistingStudentInTransaction(
        transaction,
        input.studentIdHash,
      );
      if (existing !== null) {
        if (
          existing.firstNameTh !== input.firstNameTh ||
          existing.lastNameTh !== input.lastNameTh
        ) {
          throw new Error('ROSTER_CONFLICT');
        }
        await this.finishRow(transaction, input.batchId, input.rowId, 'unchanged', input.now);
        return 'unchanged';
      }

      const people = await transaction<{ id: string }[]>`
        insert into public.people (created_at) values (${input.now}) returning id
      `;
      const person = people[0];
      if (person === undefined) throw new Error('ROSTER_PERSON_WRITE_FAILED');
      await transaction`
        insert into private.person_names (
          person_id, first_name_th, last_name_th, created_at, updated_at
        ) values (
          ${person.id}, ${input.firstNameTh}, ${input.lastNameTh}, ${input.now}, ${input.now}
        )
      `;
      await transaction`
        insert into public.students (
          person_id, entry_year, access_ends_academic_year, created_at
        ) values (
          ${person.id}, ${input.entryYear}, ${input.entryYear + 7}, ${input.now}
        )
      `;
      const accounts = await transaction<{ id: string }[]>`
        insert into public.accounts (
          person_id, provider_user_id, credential_state, created_at, updated_at
        ) values (
          ${person.id}, ${input.providerUserId}, 'initial', ${input.now}, ${input.now}
        )
        returning id
      `;
      const account = accounts[0];
      if (account === undefined) throw new Error('ROSTER_ACCOUNT_WRITE_FAILED');
      await transaction`
        insert into public.account_roles (account_id, role, created_at)
        values (${account.id}, 'student', ${input.now})
      `;
      await transaction`
        insert into private.student_auth_identities (
          account_id, student_id_hash, synthetic_identity, created_at
        ) values (
          ${account.id}, ${input.studentIdHash}, ${input.syntheticIdentity}, ${input.now}
        )
      `;
      await transaction`
        insert into private.authentication_audit_events (
          account_id, event_type, occurred_at
        ) values (${account.id}, 'student_roster_provisioned', ${input.now})
      `;
      await this.finishRow(transaction, input.batchId, input.rowId, 'created', input.now);
      return 'created';
    });
  }

  markUnchanged(input: { batchId: string; now: Date; rowId: string }): Promise<void> {
    return this.database.sql.begin(async (transaction) => {
      await this.finishRow(transaction, input.batchId, input.rowId, 'unchanged', input.now);
    });
  }

  recordFailure(input: {
    attemptCount: number;
    batchId: string;
    errorCode: RosterRowErrorCode;
    nextAttemptAt: Date;
    now: Date;
    rowId: string;
  }): Promise<void> {
    return this.database.sql.begin(async (transaction) => {
      if (input.attemptCount >= 3) {
        await transaction`
          update private.roster_rows
          set
            attempt_count = 3,
            error_code = ${input.errorCode},
            lease_until = null,
            processed_at = ${input.now},
            status = 'failed',
            updated_at = ${input.now}
          where id = ${input.rowId} and status = 'processing'
        `;
        await this.refreshBatch(transaction, input.batchId, input.now);
        return;
      }
      await transaction`
        update private.roster_rows
        set
          attempt_count = ${input.attemptCount},
          error_code = ${input.errorCode},
          lease_until = null,
          next_attempt_at = ${input.nextAttemptAt},
          status = 'pending',
          updated_at = ${input.now}
        where id = ${input.rowId} and status = 'processing'
      `;
    });
  }

  async getBatch(batchId: string): Promise<RosterBatch | null> {
    const rows = await this.database.sql<RosterBatchRow[]>`
      select * from private.roster_batches where id = ${batchId} limit 1
    `;
    return rows[0] === undefined ? null : this.mapBatch(rows[0]);
  }

  async deleteExpiredRowContent(now: Date): Promise<number> {
    const rows = await this.database.sql<{ id: string }[]>`
      delete from private.roster_rows as roster_row
      using private.roster_batches as roster_batch
      where roster_row.batch_id = roster_batch.id
        and roster_batch.completed_at <= ${now} - interval '30 days'
      returning roster_row.id
    `;
    return rows.length;
  }

  private async finishRow(
    transaction: postgres.TransactionSql,
    batchId: string,
    rowId: string,
    status: 'created' | 'unchanged',
    now: Date,
  ): Promise<void> {
    const rows = await transaction<{ id: string }[]>`
      update private.roster_rows
      set
        error_code = null,
        lease_until = null,
        processed_at = ${now},
        status = ${status},
        updated_at = ${now}
      where id = ${rowId} and status = 'processing'
      returning id
    `;
    if (rows.length > 0) await this.refreshBatch(transaction, batchId, now);
  }

  private async refreshBatch(
    transaction: postgres.TransactionSql,
    batchId: string,
    now: Date,
  ): Promise<void> {
    const batches = await transaction<
      { status: RosterBatchStatus; total_row_count: number; uploader_account_id: string }[]
    >`
      select status, total_row_count, uploader_account_id
      from private.roster_batches
      where id = ${batchId}
      for update
    `;
    const batch = batches[0];
    if (batch === undefined) throw new Error('ROSTER_BATCH_NOT_FOUND');
    const counts = await transaction<
      { created_count: number; failed_count: number; unchanged_count: number }[]
    >`
      select
        count(*) filter (where status = 'created')::integer as created_count,
        count(*) filter (where status = 'failed')::integer as failed_count,
        count(*) filter (where status = 'unchanged')::integer as unchanged_count
      from private.roster_rows
      where batch_id = ${batchId}
    `;
    const count = counts[0];
    if (count === undefined) throw new Error('ROSTER_BATCH_COUNT_FAILED');
    const processed = count.created_count + count.unchanged_count + count.failed_count;
    const isComplete = processed === batch.total_row_count;
    const status: RosterBatchStatus = isComplete
      ? count.failed_count === 0
        ? 'completed'
        : 'completed_with_errors'
      : 'processing';
    await transaction`
      update private.roster_batches
      set
        completed_at = case
          when ${isComplete} then coalesce(completed_at, ${now})
          else null
        end,
        created_count = ${count.created_count},
        failed_count = ${count.failed_count},
        processed_row_count = ${processed},
        status = ${status},
        unchanged_count = ${count.unchanged_count}
      where id = ${batchId}
    `;
    if (!isComplete || ['completed', 'completed_with_errors'].includes(batch.status)) return;
    await transaction`
      insert into private.roster_audit_events (
        batch_id, actor_account_id, event_type, occurred_at
      ) values (
        ${batchId}, ${batch.uploader_account_id}, 'roster_batch_completed', ${now}
      )
    `;
    await transaction`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'roster_batch',
        ${batchId},
        'roster_batch_completed',
        ${transaction.json({
          batchId,
          createdCount: count.created_count,
          failedCount: count.failed_count,
          status,
          unchangedCount: count.unchanged_count,
          uploaderAccountId: batch.uploader_account_id,
        })},
        ${now}
      )
      on conflict (aggregate_type, aggregate_id, event_type) do nothing
    `;
  }

  private async findExistingStudentInTransaction(
    transaction: postgres.TransactionSql,
    studentIdHash: string,
  ): Promise<ExistingRosterStudent | null> {
    const rows = await transaction<{ first_name_th: string; last_name_th: string }[]>`
      select person_name.first_name_th, person_name.last_name_th
      from private.student_auth_identities as identity
      join public.accounts as account on account.id = identity.account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      where identity.student_id_hash = ${studentIdHash}
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : { firstNameTh: row.first_name_th, lastNameTh: row.last_name_th };
  }

  private mapBatch(row: RosterBatchRow): RosterBatch {
    return {
      batchId: row.id,
      createdCount: row.created_count,
      entryYear: row.entry_year,
      failedCount: row.failed_count,
      processedRowCount: row.processed_row_count,
      status: row.status,
      totalRowCount: row.total_row_count,
      unchangedCount: row.unchanged_count,
      uploadedAt: row.uploaded_at,
    };
  }
}
