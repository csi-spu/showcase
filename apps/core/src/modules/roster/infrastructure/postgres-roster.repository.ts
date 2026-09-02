import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import { CURRENT_CONSENT_TEXT_VERSION } from '../../profiles/domain/public-profile-policy';
import {
  isPreparedRosterRow,
  type ClaimedRosterRow,
  type CreateRosterBatchInput,
  type ExistingRosterStudent,
  type RosterBatch,
  type RosterBatchStatus,
  type RosterConflict,
  type RosterConflictPage,
  type RosterRepository,
  type RosterRowErrorCode,
  type RosterRowErrorPage,
  type ResolveRosterConflictResult,
} from '../application/roster.ports';
import type { RosterConflictResolution } from '../domain/roster-conflict-resolution';
import {
  rosterErrorMessageTh,
  rosterRowRetryState,
  type RosterErrorRow,
} from '../domain/roster-error-csv';

interface RosterBatchRow {
  created_count: number;
  entry_years: number[];
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
  student_id_prefix_hashes: string[] | null;
  synthetic_identity: string;
}

interface ExistingRosterStudentRecord extends ExistingRosterStudent {
  accountId: string;
}

interface RosterConflictRecord {
  batch_id: string;
  existing_first_name_th: string;
  existing_last_name_th: string;
  id: string;
  incoming_first_name_th: string;
  incoming_last_name_th: string;
  reason: string | null;
  resolution: RosterConflictResolution | null;
  resolved_at: Date | null;
  source_row_number: number;
  status: 'pending' | 'resolved';
  version: number;
}

interface RosterConflictResolutionRecord {
  actor_account_id: string;
  conflict_id: string;
  reason: string | null;
  resolution: RosterConflictResolution;
}

@Injectable()
export class PostgresRosterRepository implements RosterRepository {
  constructor(private readonly database: DatabaseClient) {}

  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch> {
    const validRows = input.rows.filter(isPreparedRosterRow);
    const failedCount = input.rows.length - validRows.length;
    const entryYears = [...new Set(validRows.map((row) => row.entryYear))].sort(
      (left, right) => left - right,
    );
    return this.database.sql.begin(async (transaction) => {
      const batches = await transaction<RosterBatchRow[]>`
        insert into private.roster_batches (
          uploader_account_id,
          entry_years,
          total_row_count,
          processed_row_count,
          failed_count,
          uploaded_at
        ) values (
          ${input.uploaderAccountId},
          ${entryYears},
          ${input.rows.length},
          ${failedCount},
          ${failedCount},
          ${input.now}
        )
        returning *
      `;
      const batch = batches[0];
      if (batch === undefined) throw new Error('ROSTER_BATCH_WRITE_FAILED');

      for (let index = 0; index < input.rows.length; index += 500) {
        const records = input.rows.slice(index, index + 500).map((row) => {
          const isInvalid = 'errorCode' in row;
          return {
            batch_id: batch.id,
            created_at: input.now,
            entry_year: isInvalid ? null : row.entryYear,
            error_code: isInvalid ? row.errorCode : null,
            first_name_th: isInvalid ? null : row.firstNameTh,
            last_name_th: isInvalid ? null : row.lastNameTh,
            next_attempt_at: input.now,
            processed_at: isInvalid ? input.now : null,
            provider_user_id: isInvalid ? null : row.providerUserId,
            row_number: row.rowNumber,
            status: isInvalid ? 'failed' : 'pending',
            student_id: row.studentId,
            student_id_hash: isInvalid ? null : row.studentIdHash,
            student_id_prefix_hashes: isInvalid ? null : row.studentIdPrefixHashes,
            synthetic_identity: isInvalid ? null : row.syntheticIdentity,
            updated_at: input.now,
          };
        });
        await transaction`
          insert into private.roster_rows ${transaction(
            records,
            'batch_id',
            'created_at',
            'entry_year',
            'error_code',
            'first_name_th',
            'last_name_th',
            'next_attempt_at',
            'processed_at',
            'provider_user_id',
            'row_number',
            'status',
            'student_id',
            'student_id_hash',
            'student_id_prefix_hashes',
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
      if (validRows.length === 0) {
        await this.refreshBatch(transaction, batch.id, input.now);
      }
      const persistedBatches = await transaction<RosterBatchRow[]>`
        select * from private.roster_batches where id = ${batch.id}
      `;
      const persistedBatch = persistedBatches[0];
      if (persistedBatch === undefined) throw new Error('ROSTER_BATCH_WRITE_FAILED');
      return this.mapBatch(persistedBatch);
    });
  }

  claimRows(input: { leaseUntil: Date; limit: number; now: Date }): Promise<ClaimedRosterRow[]> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<ClaimedRosterRowRecord[]>`
        select
          roster_row.id,
          roster_row.batch_id,
          roster_row.entry_year,
          roster_row.row_number,
          roster_row.student_id,
          roster_row.student_id_hash,
          roster_row.student_id_prefix_hashes,
          roster_row.synthetic_identity,
          roster_row.provider_user_id,
          roster_row.first_name_th,
          roster_row.last_name_th,
          roster_row.attempt_count
        from private.roster_rows as roster_row
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
        studentIdPrefixHashes: row.student_id_prefix_hashes ?? [],
        syntheticIdentity: row.synthetic_identity,
      }));
    });
  }

  async findExistingStudent(studentIdHash: string): Promise<ExistingRosterStudent | null> {
    const rows = await this.database.sql<
      { first_name_th: string; last_name_th: string; person_id: string }[]
    >`
      select account.person_id, person_name.first_name_th, person_name.last_name_th
      from private.student_auth_identities as identity
      join public.accounts as account on account.id = identity.account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      where identity.student_id_hash = ${studentIdHash}
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          firstNameTh: row.first_name_th,
          lastNameTh: row.last_name_th,
          personId: row.person_id,
        };
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
    studentIdPrefixHashes: string[];
    syntheticIdentity: string;
  }): Promise<'conflict' | 'created' | 'unchanged'> {
    return this.database.sql.begin(async (transaction) => {
      await transaction`select 1 from (select pg_advisory_xact_lock(hashtextextended(${input.studentIdHash}::text, 0))) as advisory_lock`;
      const existing = await this.findExistingStudentInTransaction(
        transaction,
        input.studentIdHash,
      );
      if (existing !== null) {
        await this.upsertStudentIdPrefixes(
          transaction,
          existing.accountId,
          input.studentIdPrefixHashes,
          input.now,
        );
        if (
          existing.firstNameTh !== input.firstNameTh ||
          existing.lastNameTh !== input.lastNameTh
        ) {
          await this.recordConflictInTransaction(transaction, {
            batchId: input.batchId,
            existing,
            now: input.now,
            rowId: input.rowId,
            studentIdHash: input.studentIdHash,
          });
          return 'conflict';
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
      await this.upsertStudentIdPrefixes(
        transaction,
        account.id,
        input.studentIdPrefixHashes,
        input.now,
      );
      await transaction`
        insert into private.authentication_audit_events (
          account_id, event_type, occurred_at
        ) values (${account.id}, 'student_roster_provisioned', ${input.now})
      `;
      await this.grantDefaultProfileConsent(transaction, {
        accountId: account.id,
        firstNameTh: input.firstNameTh,
        lastNameTh: input.lastNameTh,
        now: input.now,
        personId: person.id,
      });
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
      select * from private.roster_batches where id = ${batchId}
      limit 1
    `;
    return rows[0] === undefined ? null : this.mapBatch(rows[0]);
  }

  async getErrorRows(batchId: string): Promise<RosterErrorRow[]> {
    const rows = await this.database.sql<
      { error_code: RosterRowErrorCode; row_number: number; student_id: string }[]
    >`
      select row_number, student_id, error_code
      from private.roster_rows
      where batch_id = ${batchId} and status = 'failed' and error_code is not null
      order by row_number
      limit 10000
    `;
    return rows.map((row) => ({
      errorCode: row.error_code,
      rowNumber: row.row_number,
      studentId: row.student_id,
    }));
  }

  async listConflicts(input: {
    afterRowNumber: number | null;
    batchId: string;
    limit: number;
  }): Promise<RosterConflictPage> {
    const rows = await this.database.sql<RosterConflictRecord[]>`
      select *
      from private.roster_conflicts
      where batch_id = ${input.batchId}
        and source_row_number > ${input.afterRowNumber ?? 1}
      order by source_row_number, id
      limit ${input.limit + 1}
    `;
    const hasNextPage = rows.length > input.limit;
    const conflicts = rows.slice(0, input.limit).map((row) => this.mapConflict(row));
    return {
      conflicts,
      nextAfterRowNumber: hasNextPage ? (conflicts.at(-1)?.rowNumber ?? null) : null,
    };
  }

  async listErrorRows(input: {
    afterRowNumber: number | null;
    batchId: string;
    limit: number;
  }): Promise<RosterRowErrorPage> {
    const rows = await this.database.sql<
      {
        attempt_count: number;
        error_code: RosterRowErrorCode;
        row_number: number;
        status: 'failed' | 'pending' | 'processing';
        student_id: string;
      }[]
    >`
      select row_number, student_id, error_code, attempt_count, status
      from private.roster_rows
      where batch_id = ${input.batchId}
        and error_code is not null
        and row_number > ${input.afterRowNumber ?? 1}
      order by row_number
      limit ${input.limit + 1}
    `;
    const hasNextPage = rows.length > input.limit;
    const errors = rows.slice(0, input.limit).map((row) => ({
      attemptCount: row.attempt_count,
      errorCode: row.error_code,
      errorMessageTh: rosterErrorMessageTh(row.error_code),
      retryState: rosterRowRetryState(row.error_code, row.status),
      rowNumber: row.row_number,
      studentId: row.student_id,
    }));
    return {
      errors,
      nextAfterRowNumber: hasNextPage ? (errors.at(-1)?.rowNumber ?? null) : null,
    };
  }

  resolveConflict(input: {
    actorAccountId: string;
    conflictId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string | null;
    resolution: RosterConflictResolution;
  }): Promise<ResolveRosterConflictResult> {
    return this.database.sql.begin(async (transaction) => {
      const replay = await this.findResolutionReplay(transaction, input);
      if (replay !== null) return replay;

      const conflicts = await transaction<RosterConflictRecord[]>`
        select * from private.roster_conflicts
        where id = ${input.conflictId}
        for update
      `;
      const conflict = conflicts[0];
      if (conflict === undefined) return { outcome: 'not_found' };
      if (conflict.status !== 'pending' || conflict.version !== input.expectedVersion) {
        return (
          (await this.findResolutionReplay(transaction, input)) ?? {
            outcome: 'version_conflict',
          }
        );
      }

      if (input.resolution === 'accept_incoming_name') {
        await transaction`
          update public.accounts
          set control_version = control_version + 1,
              updated_at = ${input.now}
          where person_id = (
            select person_id from private.roster_conflicts where id = ${input.conflictId}
          )
        `;
        await transaction`
          update private.person_names
          set
            first_name_th = ${conflict.incoming_first_name_th},
            last_name_th = ${conflict.incoming_last_name_th},
            updated_at = ${input.now}
          where person_id = (
            select person_id from private.roster_conflicts where id = ${input.conflictId}
          )
        `;
        const profiles = await transaction<{ public_id: string }[]>`
          select profile.public_id
          from private.roster_conflicts as roster_conflict
          join public.public_profiles as profile on profile.person_id = roster_conflict.person_id
          join public.profile_consents as consent
            on consent.person_id = profile.person_id and consent.withdrawn_at is null
          where roster_conflict.id = ${input.conflictId}
          limit 1
        `;
        const profile = profiles[0];
        if (profile !== undefined) {
          await transaction`
            insert into private.outbox_events (
              aggregate_type, aggregate_id, event_type, payload, occurred_at
            ) values (
              'public_profile', ${input.idempotencyKey},
              'public_profile_cache_invalidated',
              ${transaction.json({ publicId: profile.public_id })}, ${input.now}
            )
            on conflict (aggregate_type, aggregate_id, event_type) do nothing
          `;
        }
      }
      const resolved = await transaction<RosterConflictRecord[]>`
        update private.roster_conflicts
        set
          reason = ${input.reason},
          resolution = ${input.resolution},
          resolved_at = ${input.now},
          resolved_by_account_id = ${input.actorAccountId},
          resolution_idempotency_key = ${input.idempotencyKey},
          status = 'resolved',
          version = version + 1
        where id = ${input.conflictId}
        returning *
      `;
      const resolvedConflict = resolved[0];
      if (resolvedConflict === undefined) throw new Error('ROSTER_CONFLICT_WRITE_FAILED');
      await transaction`
        insert into private.roster_conflict_resolution_audit_events (
          conflict_id,
          batch_id,
          actor_account_id,
          resolution,
          reason,
          idempotency_key,
          resolved_version,
          occurred_at
        ) values (
          ${input.conflictId},
          ${conflict.batch_id},
          ${input.actorAccountId},
          ${input.resolution},
          ${input.reason},
          ${input.idempotencyKey},
          ${resolvedConflict.version},
          ${input.now}
        )
      `;
      return { conflict: this.mapConflict(resolvedConflict), outcome: 'resolved' };
    });
  }

  settleExistingRow(input: {
    batchId: string;
    now: Date;
    rowId: string;
    studentIdHash: string;
    studentIdPrefixHashes: string[];
  }): Promise<'conflict' | 'missing' | 'unchanged'> {
    return this.database.sql.begin(async (transaction) => {
      await transaction`select 1 from (select pg_advisory_xact_lock(hashtextextended(${input.studentIdHash}::text, 0))) as advisory_lock`;
      const existing = await this.findExistingStudentInTransaction(
        transaction,
        input.studentIdHash,
      );
      if (existing === null) return 'missing';
      await this.upsertStudentIdPrefixes(
        transaction,
        existing.accountId,
        input.studentIdPrefixHashes,
        input.now,
      );
      const rows = await transaction<{ first_name_th: string; last_name_th: string }[]>`
        select first_name_th, last_name_th
        from private.roster_rows
        where id = ${input.rowId} and batch_id = ${input.batchId} and status = 'processing'
      `;
      const row = rows[0];
      if (row === undefined) throw new Error('ROSTER_ROW_NOT_CLAIMED');
      if (existing.firstNameTh === row.first_name_th && existing.lastNameTh === row.last_name_th) {
        await this.finishRow(transaction, input.batchId, input.rowId, 'unchanged', input.now);
        return 'unchanged';
      }
      await this.recordConflictInTransaction(transaction, {
        batchId: input.batchId,
        existing,
        now: input.now,
        rowId: input.rowId,
        studentIdHash: input.studentIdHash,
      });
      return 'conflict';
    });
  }

  async deleteExpiredRowContent(input: { limit: number; now: Date }): Promise<number> {
    const rows = await this.database.sql<{ id: string }[]>`
      delete from private.roster_rows
      where id in (
        select roster_row.id
        from private.roster_rows as roster_row
        join private.roster_batches as roster_batch on roster_batch.id = roster_row.batch_id
        where roster_batch.completed_at <= ${input.now} - interval '30 days'
        order by roster_batch.completed_at, roster_row.id
        limit ${input.limit}
      )
      returning id
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
  }

  private async findExistingStudentInTransaction(
    transaction: postgres.TransactionSql,
    studentIdHash: string,
  ): Promise<ExistingRosterStudentRecord | null> {
    const rows = await transaction<
      { account_id: string; first_name_th: string; last_name_th: string; person_id: string }[]
    >`
      select account.id as account_id, account.person_id,
        person_name.first_name_th, person_name.last_name_th
      from private.student_auth_identities as identity
      join public.accounts as account on account.id = identity.account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      where identity.student_id_hash = ${studentIdHash}
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          accountId: row.account_id,
          firstNameTh: row.first_name_th,
          lastNameTh: row.last_name_th,
          personId: row.person_id,
        };
  }

  private async upsertStudentIdPrefixes(
    transaction: postgres.TransactionSql,
    accountId: string,
    prefixHashes: string[],
    now: Date,
  ): Promise<void> {
    if (prefixHashes.length === 0) return;
    if (prefixHashes.length !== 7) throw new Error('STUDENT_ID_PREFIX_HASHES_INVARIANT');
    await transaction`
      insert into private.student_id_search_prefixes ${transaction(
        prefixHashes.map((prefixHash, index) => ({
          account_id: accountId,
          created_at: now,
          prefix_hash: prefixHash,
          prefix_length: index + 1,
        })),
        'account_id',
        'prefix_length',
        'prefix_hash',
        'created_at',
      )}
      on conflict (account_id, prefix_length)
      do update set prefix_hash = excluded.prefix_hash
    `;
  }

  private async grantDefaultProfileConsent(
    transaction: postgres.TransactionSql,
    input: {
      accountId: string;
      firstNameTh: string;
      lastNameTh: string;
      now: Date;
      personId: string;
    },
  ): Promise<void> {
    const displayName = `${input.firstNameTh} ${input.lastNameTh}`;
    const profiles = await transaction<{ public_id: string }[]>`
      insert into public.public_profiles (
        person_id, display_name, bio, photo_id, version, created_at, updated_at
      ) values (
        ${input.personId}, ${displayName}, null, null, 1, ${input.now}, ${input.now}
      )
      returning public_id
    `;
    const profile = profiles[0];
    if (profile === undefined) throw new Error('ROSTER_PROFILE_WRITE_FAILED');

    await transaction`
      insert into public.profile_consents (
        person_id, consent_text_version, granted_at
      ) values (
        ${input.personId}, ${CURRENT_CONSENT_TEXT_VERSION}, ${input.now}
      )
      on conflict (person_id) where withdrawn_at is null do nothing
    `;

    const idempotencyKey = randomUUID();
    await transaction`
      insert into private.profile_operations (
        idempotency_key,
        person_id,
        actor_account_id,
        operation,
        expected_version,
        resulting_version,
        request_payload,
        occurred_at
      ) values (
        ${idempotencyKey},
        ${input.personId},
        ${input.accountId},
        'profile_consent_granted',
        1,
        1,
        ${transaction.json({ source: 'roster_default_consent' })},
        ${input.now}
      )
    `;
    await transaction`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'public_profile',
        ${idempotencyKey},
        'public_profile_visible',
        ${transaction.json({ publicId: profile.public_id })},
        ${input.now}
      )
      on conflict (aggregate_type, aggregate_id, event_type) do nothing
    `;
  }

  private async recordConflictInTransaction(
    transaction: postgres.TransactionSql,
    input: {
      batchId: string;
      existing: ExistingRosterStudent;
      now: Date;
      rowId: string;
      studentIdHash: string;
    },
  ): Promise<void> {
    const rows = await transaction<
      { first_name_th: string; last_name_th: string; row_number: number }[]
    >`
      select row_number, first_name_th, last_name_th
      from private.roster_rows
      where id = ${input.rowId} and batch_id = ${input.batchId} and status = 'processing'
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('ROSTER_ROW_NOT_CLAIMED');
    await transaction`
      insert into private.roster_conflicts (
        batch_id,
        source_row_number,
        person_id,
        student_id_hash,
        existing_first_name_th,
        existing_last_name_th,
        incoming_first_name_th,
        incoming_last_name_th,
        created_at
      ) values (
        ${input.batchId},
        ${row.row_number},
        ${input.existing.personId},
        ${input.studentIdHash},
        ${input.existing.firstNameTh},
        ${input.existing.lastNameTh},
        ${row.first_name_th},
        ${row.last_name_th},
        ${input.now}
      )
      on conflict (batch_id, source_row_number) do nothing
    `;
    const failed = await transaction<{ id: string }[]>`
      update private.roster_rows
      set
        attempt_count = 3,
        error_code = 'ROSTER_CONFLICT',
        lease_until = null,
        processed_at = ${input.now},
        status = 'failed',
        updated_at = ${input.now}
      where id = ${input.rowId} and status = 'processing'
      returning id
    `;
    if (failed.length > 0) await this.refreshBatch(transaction, input.batchId, input.now);
  }

  private async findResolutionReplay(
    transaction: postgres.TransactionSql,
    input: {
      actorAccountId: string;
      conflictId: string;
      idempotencyKey: string;
      reason: string | null;
      resolution: RosterConflictResolution;
    },
  ): Promise<ResolveRosterConflictResult | null> {
    const records = await transaction<RosterConflictResolutionRecord[]>`
      select conflict_id, actor_account_id, resolution, reason
      from private.roster_conflict_resolution_audit_events
      where idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    const record = records[0];
    if (record === undefined) return null;
    if (
      record.conflict_id !== input.conflictId ||
      record.actor_account_id !== input.actorAccountId ||
      record.resolution !== input.resolution ||
      record.reason !== input.reason
    ) {
      return { outcome: 'idempotency_conflict' };
    }
    const conflicts = await transaction<RosterConflictRecord[]>`
      select * from private.roster_conflicts where id = ${input.conflictId}
    `;
    const conflict = conflicts[0];
    if (conflict === undefined) throw new Error('ROSTER_CONFLICT_AUDIT_ORPHANED');
    return { conflict: this.mapConflict(conflict), outcome: 'replayed' };
  }

  private mapConflict(row: RosterConflictRecord): RosterConflict {
    return {
      batchId: row.batch_id,
      conflictId: row.id,
      existingFirstNameTh: row.existing_first_name_th,
      existingLastNameTh: row.existing_last_name_th,
      incomingFirstNameTh: row.incoming_first_name_th,
      incomingLastNameTh: row.incoming_last_name_th,
      reason: row.reason,
      resolution: row.resolution,
      resolvedAt: row.resolved_at,
      rowNumber: row.source_row_number,
      status: row.status,
      version: row.version,
    };
  }

  private mapBatch(row: RosterBatchRow): RosterBatch {
    return {
      batchId: row.id,
      createdCount: row.created_count,
      entryYears: row.entry_years,
      failedCount: row.failed_count,
      processedRowCount: row.processed_row_count,
      status: row.status,
      totalRowCount: row.total_row_count,
      unchangedCount: row.unchanged_count,
      uploadedAt: row.uploaded_at,
    };
  }
}
