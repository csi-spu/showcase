import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  AccountControlsRepository,
  AcademicYearSettings,
  BeginPasswordResetResult,
  CompletePasswordResetResult,
  CorrectStudentNameResult,
  ExtendStudentAccessResult,
  StudentAccountControls,
  UpdateAcademicYearResult,
} from '../application/account-controls.ports';
import {
  evaluateAccessExtension,
  evaluateAcademicYearChange,
} from '../domain/account-control-policy';

interface AcademicYearRow {
  current_academic_year: number | null;
  updated_at: Date;
  version: number;
}

interface AcademicYearAuditRow {
  actor_account_id: string;
  current_academic_year: number;
  expected_version: number;
  resulting_version: number;
  occurred_at: Date;
}

interface StudentAccountRow {
  access_ends_academic_year: number;
  account_id: string;
  control_version: number;
  current_academic_year: number | null;
  entry_year: number;
  first_name_th: string;
  last_name_th: string;
  provider_user_id: string;
}

interface AccessExtensionAuditRow {
  access_ends_academic_year: number;
  actor_account_id: string;
  expected_version: number;
  reason: string;
  student_account_id: string;
}

interface PasswordResetOperationRow {
  actor_account_id: string;
  attempt_number: number;
  expected_version: number;
  status: 'completed' | 'pending' | 'provider_failed';
  student_account_id: string;
}

interface PersonNameCorrectionAuditRow {
  actor_account_id: string;
  expected_version: number;
  first_name_th: string;
  last_name_th: string;
  reason: string;
  resulting_version: number;
  student_account_id: string;
}

@Injectable()
export class PostgresAccountControlsRepository implements AccountControlsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getAcademicYear(): Promise<AcademicYearSettings> {
    const rows = await this.database.sql<AcademicYearRow[]>`
      select current_academic_year, updated_at, version
      from public.academic_settings
      where singleton = true
      limit 1
    `;
    return rows[0] === undefined
      ? { currentAcademicYear: null, updatedAt: new Date(0), version: 0 }
      : this.mapAcademicYear(rows[0]);
  }

  async updateAcademicYear(input: {
    actorAccountId: string;
    currentAcademicYear: number;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<UpdateAcademicYearResult> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotencyKey(transaction, input.idempotencyKey);
      const audits = await transaction<AcademicYearAuditRow[]>`
        select
          actor_account_id,
          current_academic_year,
          expected_version,
          resulting_version,
          occurred_at
        from private.academic_year_change_audit_events
        where idempotency_key = ${input.idempotencyKey}
        limit 1
      `;
      const audit = audits[0];
      if (audit !== undefined) {
        if (
          audit.actor_account_id !== input.actorAccountId ||
          audit.current_academic_year !== input.currentAcademicYear ||
          audit.expected_version !== input.expectedVersion
        ) {
          return { outcome: 'idempotency_conflict' };
        }
        return {
          outcome: 'replayed',
          settings: {
            currentAcademicYear: audit.current_academic_year,
            updatedAt: audit.occurred_at,
            version: audit.resulting_version,
          },
        };
      }

      const settingsRows = await transaction<AcademicYearRow[]>`
        select current_academic_year, updated_at, version
        from public.academic_settings
        where singleton = true
        for update
      `;
      const settings = settingsRows[0] ?? {
        current_academic_year: null,
        updated_at: new Date(0),
        version: 0,
      };
      if (settings.version !== input.expectedVersion) {
        return { outcome: 'version_conflict' };
      }
      const change = evaluateAcademicYearChange(
        settings.current_academic_year,
        input.currentAcademicYear,
      );
      if (change === 'invalid') {
        return { outcome: 'backward' };
      }
      if (change === 'unchanged') {
        return { outcome: 'replayed', settings: this.mapAcademicYear(settings) };
      }

      const resultingVersion = settings.version + 1;
      await transaction`
        insert into public.academic_settings (
          singleton, current_academic_year, version, updated_at, updated_by_account_id
        ) values (
          true, ${input.currentAcademicYear}, ${resultingVersion}, ${input.now}, ${input.actorAccountId}
        )
        on conflict (singleton) do update
        set current_academic_year = excluded.current_academic_year,
            version = excluded.version,
            updated_at = excluded.updated_at,
            updated_by_account_id = excluded.updated_by_account_id
      `;
      await transaction`
        insert into private.academic_year_change_audit_events (
          idempotency_key,
          actor_account_id,
          previous_academic_year,
          current_academic_year,
          expected_version,
          resulting_version,
          occurred_at
        ) values (
          ${input.idempotencyKey},
          ${input.actorAccountId},
          ${settings.current_academic_year},
          ${input.currentAcademicYear},
          ${input.expectedVersion},
          ${resultingVersion},
          ${input.now}
        )
      `;
      return {
        outcome: 'updated',
        settings: {
          currentAcademicYear: input.currentAcademicYear,
          updatedAt: input.now,
          version: resultingVersion,
        },
      };
    });
  }

  async findStudent(studentIdHash: string): Promise<StudentAccountControls | null> {
    const rows = await this.database.sql<StudentAccountRow[]>`
      select
        student.access_ends_academic_year,
        account.id as account_id,
        account.control_version,
        settings.current_academic_year,
        student.entry_year,
        person_name.first_name_th,
        person_name.last_name_th,
        account.provider_user_id
      from private.student_auth_identities as identity
      join public.accounts as account on account.id = identity.account_id
      join public.account_roles as student_role
        on student_role.account_id = account.id and student_role.role = 'student'
      join public.students as student on student.person_id = account.person_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      left join public.academic_settings as settings on settings.singleton = true
      where identity.student_id_hash = ${studentIdHash}
      limit 1
    `;
    return rows[0] === undefined ? null : this.mapStudent(rows[0]);
  }

  async extendStudentAccess(input: {
    accessEndsAcademicYear: number;
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<ExtendStudentAccessResult> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotencyKey(transaction, input.idempotencyKey);
      const audits = await transaction<AccessExtensionAuditRow[]>`
        select
          access_ends_academic_year,
          actor_account_id,
          expected_version,
          reason,
          student_account_id
        from private.student_access_extension_audit_events
        where idempotency_key = ${input.idempotencyKey}
        limit 1
      `;
      const audit = audits[0];
      if (audit !== undefined) {
        if (
          audit.access_ends_academic_year !== input.accessEndsAcademicYear ||
          audit.actor_account_id !== input.actorAccountId ||
          audit.expected_version !== input.expectedVersion ||
          audit.reason !== input.reason ||
          audit.student_account_id !== input.studentAccountId
        ) {
          return { outcome: 'idempotency_conflict' };
        }
        const replayed = await this.findStudentByAccount(transaction, input.studentAccountId);
        return replayed === null
          ? { outcome: 'not_found' }
          : { outcome: 'replayed', student: replayed };
      }

      const student = await this.findStudentByAccount(transaction, input.studentAccountId, true);
      if (student === null) return { outcome: 'not_found' };
      if (student.version !== input.expectedVersion) return { outcome: 'version_conflict' };
      const extension = evaluateAccessExtension(
        student.accessEndsAcademicYear,
        input.accessEndsAcademicYear,
      );
      if (extension === 'invalid') {
        return { outcome: 'shortening' };
      }
      if (extension === 'unchanged') {
        return { outcome: 'unchanged', student };
      }

      const resultingVersion = student.version + 1;
      await transaction`
        update public.students as student
        set access_ends_academic_year = ${input.accessEndsAcademicYear}
        from public.accounts as account
        where account.id = ${input.studentAccountId}
          and student.person_id = account.person_id
      `;
      await transaction`
        update public.accounts
        set control_version = ${resultingVersion}, updated_at = ${input.now}
        where id = ${input.studentAccountId}
      `;
      await transaction`
        insert into private.student_access_extension_audit_events (
          idempotency_key,
          actor_account_id,
          student_account_id,
          previous_access_ends_academic_year,
          access_ends_academic_year,
          reason,
          expected_version,
          resulting_version,
          occurred_at
        ) values (
          ${input.idempotencyKey},
          ${input.actorAccountId},
          ${input.studentAccountId},
          ${student.accessEndsAcademicYear},
          ${input.accessEndsAcademicYear},
          ${input.reason},
          ${input.expectedVersion},
          ${resultingVersion},
          ${input.now}
        )
      `;
      await transaction`
        insert into private.outbox_events (
          aggregate_type, aggregate_id, event_type, payload, occurred_at
        ) values (
          'student_access_extension',
          ${input.idempotencyKey},
          'student_access_extended',
          ${transaction.json({
            accessEndsAcademicYear: input.accessEndsAcademicYear,
            studentAccountId: input.studentAccountId,
          })},
          ${input.now}
        )
        on conflict (aggregate_type, aggregate_id, event_type) do nothing
      `;
      return {
        outcome: 'updated',
        student: {
          ...student,
          accessEndsAcademicYear: input.accessEndsAcademicYear,
          version: resultingVersion,
        },
      };
    });
  }

  async correctStudentName(input: {
    actorAccountId: string;
    expectedVersion: number;
    firstNameTh: string;
    idempotencyKey: string;
    lastNameTh: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<CorrectStudentNameResult> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotencyKey(transaction, input.idempotencyKey);
      const audits = await transaction<PersonNameCorrectionAuditRow[]>`
        select actor_account_id, expected_version, first_name_th, last_name_th,
          reason, resulting_version, student_account_id
        from private.person_name_correction_audit_events
        where idempotency_key = ${input.idempotencyKey}
        limit 1
      `;
      const audit = audits[0];
      if (audit !== undefined) {
        if (
          audit.actor_account_id !== input.actorAccountId ||
          audit.expected_version !== input.expectedVersion ||
          audit.first_name_th !== input.firstNameTh ||
          audit.last_name_th !== input.lastNameTh ||
          audit.reason !== input.reason ||
          audit.student_account_id !== input.studentAccountId
        ) {
          return { outcome: 'idempotency_conflict' };
        }
        const replayed = await this.findStudentByAccount(transaction, input.studentAccountId);
        return replayed === null
          ? { outcome: 'not_found' }
          : {
              outcome: 'replayed',
              student: {
                ...replayed,
                firstNameTh: audit.first_name_th,
                lastNameTh: audit.last_name_th,
                version: audit.resulting_version,
              },
            };
      }

      const student = await this.findStudentByAccount(transaction, input.studentAccountId, true);
      if (student === null) return { outcome: 'not_found' };
      if (student.version !== input.expectedVersion) return { outcome: 'version_conflict' };

      const isUnchanged =
        student.firstNameTh === input.firstNameTh && student.lastNameTh === input.lastNameTh;
      const resultingVersion = isUnchanged ? student.version : student.version + 1;
      if (!isUnchanged) {
        await transaction`
          update private.person_names as name
          set first_name_th = ${input.firstNameTh},
              last_name_th = ${input.lastNameTh},
              updated_at = ${input.now}
          from public.accounts as account
          where account.id = ${input.studentAccountId}
            and name.person_id = account.person_id
        `;
        await transaction`
          update public.accounts
          set control_version = ${resultingVersion}, updated_at = ${input.now}
          where id = ${input.studentAccountId}
        `;
      }
      await transaction`
        insert into private.person_name_correction_audit_events (
          idempotency_key, actor_account_id, student_account_id,
          previous_first_name_th, previous_last_name_th, first_name_th, last_name_th,
          reason, expected_version, resulting_version, occurred_at
        ) values (
          ${input.idempotencyKey}, ${input.actorAccountId}, ${input.studentAccountId},
          ${student.firstNameTh}, ${student.lastNameTh}, ${input.firstNameTh},
          ${input.lastNameTh}, ${input.reason}, ${input.expectedVersion},
          ${resultingVersion}, ${input.now}
        )
      `;

      if (!isUnchanged) {
        const profiles = await transaction<{ public_id: string }[]>`
          select profile.public_id
          from public.accounts as account
          join public.public_profiles as profile on profile.person_id = account.person_id
          join public.profile_consents as consent
            on consent.person_id = profile.person_id and consent.withdrawn_at is null
          where account.id = ${input.studentAccountId}
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

      return {
        outcome: isUnchanged ? 'unchanged' : 'updated',
        student: {
          ...student,
          firstNameTh: input.firstNameTh,
          lastNameTh: input.lastNameTh,
          version: resultingVersion,
        },
      };
    });
  }

  async beginPasswordReset(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    studentAccountId: string;
  }): Promise<BeginPasswordResetResult> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotencyKey(transaction, input.idempotencyKey);
      const operationRows = await transaction<PasswordResetOperationRow[]>`
        select
          actor_account_id,
          attempt_number,
          expected_version,
          status,
          student_account_id
        from private.student_password_reset_operations
        where idempotency_key = ${input.idempotencyKey}
        for update
      `;
      const operation = operationRows[0];
      if (operation !== undefined) {
        if (
          operation.actor_account_id !== input.actorAccountId ||
          operation.expected_version !== input.expectedVersion ||
          operation.student_account_id !== input.studentAccountId
        ) {
          return { outcome: 'idempotency_conflict' };
        }
        if (operation.status === 'completed') return { outcome: 'already_completed' };
        if (operation.status === 'pending') return { outcome: 'in_progress' };
        const target = await this.findStudentByAccount(transaction, input.studentAccountId, true);
        if (target === null) return { outcome: 'not_found' };
        if (
          await this.hasPendingPasswordReset(
            transaction,
            input.studentAccountId,
            input.idempotencyKey,
          )
        ) {
          return { outcome: 'in_progress' };
        }
        const attemptNumber = operation.attempt_number + 1;
        await transaction`
          update private.student_password_reset_operations
          set status = 'pending',
              attempt_number = ${attemptNumber},
              error_code = null,
              finished_at = null,
              lease_until = ${new Date(input.now.getTime() + 90_000)}
          where idempotency_key = ${input.idempotencyKey}
        `;
        return { attemptNumber, outcome: 'ready', providerUserId: target.providerUserId };
      }

      const target = await this.findStudentByAccount(transaction, input.studentAccountId, true);
      if (target === null) return { outcome: 'not_found' };
      if (
        await this.hasPendingPasswordReset(
          transaction,
          input.studentAccountId,
          input.idempotencyKey,
        )
      ) {
        return { outcome: 'in_progress' };
      }
      if (target.version !== input.expectedVersion) return { outcome: 'version_conflict' };
      const resultingVersion = target.version + 1;
      await transaction`
        insert into private.student_password_reset_operations (
          idempotency_key,
          actor_account_id,
          student_account_id,
          expected_version,
          resulting_version,
          attempt_number,
          status,
          started_at,
          lease_until
        ) values (
          ${input.idempotencyKey},
          ${input.actorAccountId},
          ${input.studentAccountId},
          ${input.expectedVersion},
          ${resultingVersion},
          1,
          'pending',
          ${input.now},
          ${new Date(input.now.getTime() + 90_000)}
        )
      `;
      await transaction`
        update public.accounts
        set credential_state = 'reset_required',
            control_version = ${resultingVersion},
            updated_at = ${input.now}
        where id = ${input.studentAccountId}
      `;
      await transaction`
        update private.authentication_sessions
        set revoked_at = ${input.now}, revocation_reason = 'password_reset'
        where account_id = ${input.studentAccountId} and revoked_at is null
      `;
      await transaction`
        insert into private.authentication_audit_events (
          account_id, event_type, occurred_at
        ) values (
          ${input.studentAccountId}, 'student_password_reset_started', ${input.now}
        )
      `;
      return { attemptNumber: 1, outcome: 'ready', providerUserId: target.providerUserId };
    });
  }

  async completePasswordReset(input: {
    attemptNumber: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<CompletePasswordResetResult> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<{ student_account_id: string }[]>`
        update private.student_password_reset_operations
        set status = 'completed',
            error_code = null,
            finished_at = ${input.now},
            lease_until = null
        where idempotency_key = ${input.idempotencyKey}
          and attempt_number = ${input.attemptNumber}
          and status = 'pending'
        returning student_account_id
      `;
      const operation = rows[0];
      if (operation === undefined) return { outcome: 'not_pending' };
      await transaction`
        insert into private.authentication_audit_events (
          account_id, event_type, occurred_at
        ) values (
          ${operation.student_account_id}, 'student_password_reset_completed', ${input.now}
        )
      `;
      const student = await this.findStudentByAccount(transaction, operation.student_account_id);
      return student === null ? { outcome: 'not_pending' } : { outcome: 'completed', student };
    });
  }

  async failPasswordReset(input: {
    attemptNumber: number;
    errorCode: 'provider_unavailable';
    idempotencyKey: string;
    now: Date;
  }): Promise<void> {
    await this.database.sql.begin(async (transaction) => {
      const rows = await transaction<{ student_account_id: string }[]>`
        update private.student_password_reset_operations
        set status = 'provider_failed',
            error_code = ${input.errorCode},
            finished_at = ${input.now},
            lease_until = null
        where idempotency_key = ${input.idempotencyKey}
          and attempt_number = ${input.attemptNumber}
          and status = 'pending'
        returning student_account_id
      `;
      const operation = rows[0];
      if (operation !== undefined) {
        await transaction`
          insert into private.authentication_audit_events (
            account_id, event_type, error_code, occurred_at
          ) values (
            ${operation.student_account_id},
            'student_password_reset_failed',
            ${input.errorCode},
            ${input.now}
          )
        `;
      }
    });
  }

  private async findStudentByAccount(
    transaction: postgres.TransactionSql,
    accountId: string,
    shouldLock = false,
  ): Promise<(StudentAccountControls & { providerUserId: string }) | null> {
    const rows = shouldLock
      ? await transaction<StudentAccountRow[]>`
          select
            student.access_ends_academic_year,
            account.id as account_id,
            account.control_version,
            settings.current_academic_year,
            student.entry_year,
            person_name.first_name_th,
            person_name.last_name_th,
            account.provider_user_id
          from public.accounts as account
          join public.account_roles as student_role
            on student_role.account_id = account.id and student_role.role = 'student'
          join public.students as student on student.person_id = account.person_id
          join private.person_names as person_name on person_name.person_id = account.person_id
          left join public.academic_settings as settings on settings.singleton = true
          where account.id = ${accountId}
          for update of account, student, person_name
        `
      : await transaction<StudentAccountRow[]>`
          select
            student.access_ends_academic_year,
            account.id as account_id,
            account.control_version,
            settings.current_academic_year,
            student.entry_year,
            person_name.first_name_th,
            person_name.last_name_th,
            account.provider_user_id
          from public.accounts as account
          join public.account_roles as student_role
            on student_role.account_id = account.id and student_role.role = 'student'
          join public.students as student on student.person_id = account.person_id
          join private.person_names as person_name on person_name.person_id = account.person_id
          left join public.academic_settings as settings on settings.singleton = true
          where account.id = ${accountId}
        `;
    const row = rows[0];
    return row === undefined
      ? null
      : { ...this.mapStudent(row), providerUserId: row.provider_user_id };
  }

  private async hasPendingPasswordReset(
    transaction: postgres.TransactionSql,
    studentAccountId: string,
    excludedIdempotencyKey: string,
  ): Promise<boolean> {
    const rows = await transaction<{ exists: boolean }[]>`
      select exists (
        select 1
        from private.student_password_reset_operations
        where student_account_id = ${studentAccountId}
          and idempotency_key <> ${excludedIdempotencyKey}
          and status = 'pending'
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  private async lockIdempotencyKey(
    transaction: postgres.TransactionSql,
    idempotencyKey: string,
  ): Promise<void> {
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
    `;
  }

  private mapAcademicYear(row: AcademicYearRow): AcademicYearSettings {
    return {
      currentAcademicYear: row.current_academic_year,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  private mapStudent(row: StudentAccountRow): StudentAccountControls {
    return {
      accessEndsAcademicYear: row.access_ends_academic_year,
      accountId: row.account_id,
      currentAcademicYear: row.current_academic_year,
      entryYear: row.entry_year,
      firstNameTh: row.first_name_th,
      lastNameTh: row.last_name_th,
      version: row.control_version,
    };
  }
}
