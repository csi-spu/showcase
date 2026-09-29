import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type { PrismaQuery, PrismaSql } from '../../auth/infrastructure/prisma-sql';
import type {
  CollectionDeletionCounts,
  CollectionDeletionLogRecord,
  CollectionDeletionPreview,
  CollectionDeletionsRepository,
  CollectionDeletionTarget,
  DeleteCollectionItemResult,
  RestoreCollectionDeletionResult,
} from '../application/collection-deletions.ports';
import {
  deletionBlocker,
  matchesConfirmationName,
  restoreAvailability,
} from '../domain/collection-deletion';
import type {
  CollectionDeletionTargetKind,
  CollectionRoundStatus,
  DeletionLogPosition,
} from '../domain/collection-deletion';

/** A live target with its ancestors, as the preview and the deletion read it. */
interface TargetRow {
  group_id: string | null;
  group_name: string | null;
  name: string;
  round_id: string;
  round_name: string;
  round_status: CollectionRoundStatus;
}

interface CountsRow {
  assigned_student_count: number;
  form_count: number;
  group_count: number;
  submitted_student_count: number;
}

interface DeletionRow {
  form_id: string | null;
  group_id: string | null;
  restored_at: Date | null;
  round_id: string;
  target_kind: CollectionDeletionTargetKind;
}

interface AncestorRow {
  group_name: string | null;
  is_group_deleted: boolean;
  is_round_deleted: boolean;
  round_name: string;
  round_status: CollectionRoundStatus;
}

interface LogRow extends CountsRow {
  deleted_at: Date;
  deleted_at_micros: string;
  deleted_by_name: string;
  form_title: string | null;
  group_name: string | null;
  id: string;
  is_group_deleted: boolean;
  is_round_deleted: boolean;
  restore_reason: string | null;
  restored_at: Date | null;
  restored_by_name: string | null;
  round_name: string;
  round_status: CollectionRoundStatus;
  target_kind: CollectionDeletionTargetKind;
}

/*
 * Lock order is form, then group, then round. Every existing collection
 * mutation that locks more than one of them takes the lower level first
 * (`for update of form, round`), so taking them the other way here would
 * deadlock against an ordinary edit. Rows at one level are locked in id order
 * so two deletions over overlapping rows queue instead of deadlocking.
 */
@Injectable()
export class PostgresCollectionDeletionsRepository implements CollectionDeletionsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async previewDeletion(
    target: CollectionDeletionTarget,
  ): Promise<CollectionDeletionPreview | null> {
    const sql = this.database.sql;
    const rows = await this.targetQuery(sql, target);
    const row = rows[0];
    if (row === undefined) return null;
    const counts = await this.countImpact(sql, this.liveScope(sql, target));
    return {
      blockedReason: deletionBlocker({ roundStatus: row.round_status, targetKind: target.kind }),
      counts,
      group: target.kind === 'form' ? { id: row.group_id!, name: row.group_name! } : null,
      kind: target.kind,
      name: row.name,
      round: target.kind === 'round' ? null : { id: row.round_id, name: row.round_name },
    };
  }

  async deleteItem(input: {
    actorAccountId: string;
    confirmationName: string;
    now: Date;
    target: CollectionDeletionTarget;
  }): Promise<DeleteCollectionItemResult> {
    const { target } = input;
    return this.database.sql.begin(async (transaction) => {
      const row = await this.lockTarget(transaction, target);
      if (row === null) return { outcome: 'not_found' };
      if (deletionBlocker({ roundStatus: row.round_status, targetKind: target.kind }) !== null) {
        return { outcome: 'round_closed' };
      }
      if (!matchesConfirmationName(row.name, input.confirmationName)) {
        return { outcome: 'confirmation_mismatch' };
      }

      const groupId = target.kind === 'round' ? null : row.group_id;
      const formId = target.kind === 'form' ? target.id : null;
      /* Counts start at zero and are set from the rows actually stamped below. */
      const inserted = await transaction<{ id: string }[]>`
        insert into private.collection_deletions
          (target_kind, round_id, group_id, form_id, group_count, form_count,
            assigned_student_count, submitted_student_count, deleted_by_account_id, deleted_at)
        values (${target.kind}, ${row.round_id}, ${groupId}::uuid, ${formId}::uuid, 0, 0, 0, 0,
          ${input.actorAccountId}, ${input.now})
        returning id
      `;
      const deletionId = inserted[0]!.id;

      /*
       * Stamped top-down, each statement seeing rows committed before it: an
       * item created beneath the target while this transaction waited for its
       * locks is stamped too, and once a level is stamped nothing new can be
       * created beneath it, because creation locks the live parent.
       */
      if (target.kind === 'round') {
        await transaction`
          update public.collection_rounds set deletion_id = ${deletionId} where id = ${target.id}
        `;
      }
      if (target.kind !== 'form') {
        await transaction`
          update public.collection_groups set deletion_id = ${deletionId}
          ${this.liveGroupsWhere(transaction, target)}
        `;
      }
      await transaction`
        update public.collection_forms set deletion_id = ${deletionId}
        ${
          target.kind === 'form'
            ? transaction`where id = ${target.id}`
            : transaction`where group_id in (
                select id from public.collection_groups where deletion_id = ${deletionId}
              ) and deletion_id is null`
        }
      `;

      const counts = await this.countImpact(transaction, {
        forms: transaction`where deletion_id = ${deletionId}`,
        groups: transaction`where deletion_id = ${deletionId}`,
      });
      await transaction`
        update private.collection_deletions
        set group_count = ${counts.groupCount},
            form_count = ${counts.formCount},
            assigned_student_count = ${counts.assignedStudentCount},
            submitted_student_count = ${counts.submittedStudentCount}
        where id = ${deletionId}
      `;
      return { deletionId, outcome: 'deleted' };
    });
  }

  async restoreDeletion(input: {
    actorAccountId: string;
    deletionId: string;
    now: Date;
    reason: string;
  }): Promise<RestoreCollectionDeletionResult> {
    return this.database.sql.begin(async (transaction) => {
      const deletions = await transaction<DeletionRow[]>`
        select target_kind, round_id, group_id, form_id, restored_at
        from private.collection_deletions
        where id = ${input.deletionId}
        for update
      `;
      const deletion = deletions[0];
      if (deletion === undefined) return { outcome: 'not_found' };
      if (deletion.restored_at !== null) {
        return { availability: { status: 'already_restored' }, outcome: 'unavailable' };
      }

      await transaction`
        select id from public.collection_forms where deletion_id = ${input.deletionId}
        order by id for no key update
      `;
      await transaction`
        select id from public.collection_groups where deletion_id = ${input.deletionId}
        order by id for no key update
      `;
      const ancestors = await this.lockAncestors(transaction, deletion);
      const availability = restoreAvailability({
        deletedGroupName: ancestors.is_group_deleted ? ancestors.group_name : null,
        deletedRoundName: ancestors.is_round_deleted ? ancestors.round_name : null,
        isRestored: false,
        roundStatus: ancestors.round_status,
        targetKind: deletion.target_kind,
      });
      if (availability.status !== 'available') return { availability, outcome: 'unavailable' };

      /* Only this deletion's rows: a separate, earlier deletion beneath it stays. */
      await transaction`
        update public.collection_forms set deletion_id = null
        where deletion_id = ${input.deletionId}
      `;
      await transaction`
        update public.collection_groups set deletion_id = null
        where deletion_id = ${input.deletionId}
      `;
      await transaction`
        update public.collection_rounds set deletion_id = null
        where deletion_id = ${input.deletionId}
      `;
      await transaction`
        update private.collection_deletions
        set restored_by_account_id = ${input.actorAccountId},
            restored_at = ${input.now},
            restore_reason = ${input.reason}
        where id = ${input.deletionId}
      `;
      return { outcome: 'restored' };
    });
  }

  async listDeletions(input: {
    before: DeletionLogPosition | null;
    limit: number;
  }): Promise<{ entries: CollectionDeletionLogRecord[]; hasMore: boolean }> {
    const sql = this.database.sql;
    const after =
      input.before === null
        ? sql``
        : sql`where (deletion.deleted_at, deletion.id) < (
            'epoch'::timestamptz + ${input.before.deletedAtMicros}::bigint * interval '1 microsecond',
            ${input.before.deletionId}::uuid
          )`;
    const rows = await sql<LogRow[]>`
      select deletion.id, deletion.target_kind, deletion.deleted_at,
        (extract(epoch from deletion.deleted_at) * 1000000)::bigint::text as deleted_at_micros,
        deletion.group_count, deletion.form_count,
        deletion.assigned_student_count, deletion.submitted_student_count,
        deletion.restored_at, deletion.restore_reason,
        round.name as round_name, round.status as round_status,
        round.deletion_id is not null as is_round_deleted,
        collection_group.name as group_name,
        collection_group.deletion_id is not null as is_group_deleted,
        form.title as form_title,
        coalesce(btrim(deleter_name.first_name_th || ' ' || deleter_name.last_name_th), '')
          as deleted_by_name,
        case when deletion.restored_by_account_id is not null then
          coalesce(btrim(restorer_name.first_name_th || ' ' || restorer_name.last_name_th), '')
        end as restored_by_name
      from private.collection_deletions as deletion
      join public.collection_rounds as round on round.id = deletion.round_id
      left join public.collection_groups as collection_group
        on collection_group.id = deletion.group_id
      left join public.collection_forms as form on form.id = deletion.form_id
      join public.accounts as deleter on deleter.id = deletion.deleted_by_account_id
      left join private.person_names as deleter_name on deleter_name.person_id = deleter.person_id
      left join public.accounts as restorer on restorer.id = deletion.restored_by_account_id
      left join private.person_names as restorer_name
        on restorer_name.person_id = restorer.person_id
      ${after}
      order by deletion.deleted_at desc, deletion.id desc
      limit ${input.limit + 1}
    `;
    /* One row beyond the page proves there is a next page without counting. */
    return {
      entries: rows.slice(0, input.limit).map((row) => this.mapLogRow(row)),
      hasMore: rows.length > input.limit,
    };
  }

  private mapLogRow(row: LogRow): CollectionDeletionLogRecord {
    const kind = row.target_kind;
    return {
      counts: this.mapCounts(row),
      deletedAt: row.deleted_at,
      deletedAtMicros: row.deleted_at_micros,
      deletedByName: row.deleted_by_name,
      groupName: kind === 'form' ? row.group_name : null,
      id: row.id,
      kind,
      name: kind === 'form' ? row.form_title! : kind === 'group' ? row.group_name! : row.round_name,
      restore:
        row.restored_at === null
          ? null
          : {
              reason: row.restore_reason!,
              restoredAt: row.restored_at,
              restoredByName: row.restored_by_name!,
            },
      restoreAvailability: restoreAvailability({
        deletedGroupName: kind === 'form' && row.is_group_deleted ? row.group_name : null,
        deletedRoundName: kind !== 'round' && row.is_round_deleted ? row.round_name : null,
        isRestored: row.restored_at !== null,
        roundStatus: row.round_status,
        targetKind: kind,
      }),
      roundName: kind === 'round' ? null : row.round_name,
    };
  }

  /* The live target with its ancestors, without locking. */
  private targetQuery(sql: PrismaSql, target: CollectionDeletionTarget): PrismaQuery<TargetRow[]> {
    if (target.kind === 'round') {
      return sql<TargetRow[]>`
        select round.name, null::uuid as group_id, null::text as group_name,
          round.id as round_id, round.name as round_name, round.status as round_status
        from public.collection_rounds as round
        where round.id = ${target.id} and round.deletion_id is null
      `;
    }
    if (target.kind === 'group') {
      return sql<TargetRow[]>`
        select collection_group.name, collection_group.id as group_id,
          collection_group.name as group_name,
          round.id as round_id, round.name as round_name, round.status as round_status
        from public.collection_groups as collection_group
        join public.collection_rounds as round on round.id = collection_group.round_id
        where collection_group.id = ${target.id} and collection_group.deletion_id is null
      `;
    }
    return sql<TargetRow[]>`
      select form.title as name, collection_group.id as group_id,
        collection_group.name as group_name,
        round.id as round_id, round.name as round_name, round.status as round_status
      from public.collection_forms as form
      join public.collection_groups as collection_group on collection_group.id = form.group_id
      join public.collection_rounds as round on round.id = collection_group.round_id
      where form.id = ${target.id} and form.deletion_id is null
    `;
  }

  /**
   * Locks the live target and everything beneath it, form then group then
   * round, and returns the target as it stands under those locks. A form's
   * group is locked too, because adding or reinstating members inserts that
   * form's obligations under a lock on the group. Null when the target is
   * missing or a concurrent deletion removed it first.
   */
  private async lockTarget(
    transaction: PrismaSql,
    target: CollectionDeletionTarget,
  ): Promise<TargetRow | null> {
    if (target.kind === 'form') {
      const forms = await transaction<{ group_id: string; title: string }[]>`
        select group_id, title from public.collection_forms
        where id = ${target.id} and deletion_id is null
        for no key update
      `;
      const form = forms[0];
      if (form === undefined) return null;
      const groups = await transaction<{ name: string; round_id: string }[]>`
        select name, round_id from public.collection_groups where id = ${form.group_id}
        for no key update
      `;
      const group = groups[0]!;
      const round = await this.lockRound(transaction, group.round_id, 'share');
      return {
        group_id: form.group_id,
        group_name: group.name,
        name: form.title,
        round_id: group.round_id,
        round_name: round!.name,
        round_status: round!.status,
      };
    }

    await transaction`
      select id from public.collection_forms
      where group_id in (select id from public.collection_groups ${this.liveGroupsWhere(transaction, target)})
        and deletion_id is null
      order by id
      for no key update
    `;
    const groups = await transaction<{ id: string; name: string; round_id: string }[]>`
      select id, name, round_id from public.collection_groups
      ${this.liveGroupsWhere(transaction, target)}
      order by id
      for no key update
    `;

    if (target.kind === 'group') {
      const group = groups[0];
      if (group === undefined) return null;
      const round = await this.lockRound(transaction, group.round_id, 'share');
      return {
        group_id: group.id,
        group_name: group.name,
        name: group.name,
        round_id: group.round_id,
        round_name: round!.name,
        round_status: round!.status,
      };
    }

    const round = await this.lockRound(transaction, target.id, 'update');
    if (round === null) return null;
    return {
      group_id: null,
      group_name: null,
      name: round.name,
      round_id: target.id,
      round_name: round.name,
      round_status: round.status,
    };
  }

  /*
   * A live round when locking for its own deletion. A group's or form's round
   * is live whenever the item is, since a live item never has a deleted
   * ancestor, so that lock only holds the round's status still.
   */
  private async lockRound(
    transaction: PrismaSql,
    roundId: string,
    mode: 'share' | 'update',
  ): Promise<{ name: string; status: CollectionRoundStatus } | null> {
    const rows =
      mode === 'update'
        ? await transaction<{ name: string; status: CollectionRoundStatus }[]>`
            select name, status from public.collection_rounds
            where id = ${roundId} and deletion_id is null
            for update
          `
        : await transaction<{ name: string; status: CollectionRoundStatus }[]>`
            select name, status from public.collection_rounds where id = ${roundId} for share
          `;
    return rows[0] ?? null;
  }

  /*
   * Locks what a restore checks: the target's round and, for a form, its
   * group. The rows this deletion stamped are already locked by the caller.
   */
  private async lockAncestors(transaction: PrismaSql, deletion: DeletionRow): Promise<AncestorRow> {
    if (deletion.target_kind === 'form') {
      const rows = await transaction<AncestorRow[]>`
        select round.name as round_name, round.status as round_status,
          round.deletion_id is not null as is_round_deleted,
          collection_group.name as group_name,
          collection_group.deletion_id is not null as is_group_deleted
        from public.collection_groups as collection_group
        join public.collection_rounds as round on round.id = collection_group.round_id
        where collection_group.id = ${deletion.group_id}
        for share of collection_group, round
      `;
      return rows[0]!;
    }
    const rounds = await transaction<
      { is_deleted: boolean; name: string; status: CollectionRoundStatus }[]
    >`
      select name, status, deletion_id is not null as is_deleted
      from public.collection_rounds
      where id = ${deletion.round_id}
      ${deletion.target_kind === 'round' ? transaction`for update` : transaction`for share`}
    `;
    const round = rounds[0]!;
    return {
      group_name: null,
      is_group_deleted: false,
      /* A round target carries this deletion's own marker, not an ancestor's. */
      is_round_deleted: deletion.target_kind !== 'round' && round.is_deleted,
      round_name: round.name,
      round_status: round.status,
    };
  }

  /* The live groups a round or group deletion removes. */
  private liveGroupsWhere(
    sql: PrismaSql,
    target: CollectionDeletionTarget,
  ): PrismaQuery<unknown[]> {
    return target.kind === 'round'
      ? sql`where round_id = ${target.id} and deletion_id is null`
      : sql`where id = ${target.id} and deletion_id is null`;
  }

  /* What deleting the target now would remove, for the preview. */
  private liveScope(
    sql: PrismaSql,
    target: CollectionDeletionTarget,
  ): { forms: PrismaQuery<unknown[]>; groups: PrismaQuery<unknown[]> } {
    if (target.kind === 'form') {
      return {
        forms: sql`where id = ${target.id} and deletion_id is null`,
        groups: sql`where false`,
      };
    }
    return {
      forms: sql`where group_id in (
        select id from public.collection_groups ${this.liveGroupsWhere(sql, target)}
      ) and deletion_id is null`,
      groups: this.liveGroupsWhere(sql, target),
    };
  }

  /*
   * Groups, forms, and distinct Students in scope. A withdrawn member no longer
   * owes the form, so they are neither assigned nor counted as submitted.
   */
  private async countImpact(
    sql: PrismaSql,
    scope: { forms: PrismaQuery<unknown[]>; groups: PrismaQuery<unknown[]> },
  ): Promise<CollectionDeletionCounts> {
    const rows = await sql<CountsRow[]>`
      with scoped_groups as (
        select id from public.collection_groups ${scope.groups}
      ),
      scoped_forms as (
        select id from public.collection_forms ${scope.forms}
      )
      select
        (select count(*) from scoped_groups)::int as group_count,
        (select count(*) from scoped_forms)::int as form_count,
        count(distinct obligation.student_account_id)::int as assigned_student_count,
        count(distinct obligation.student_account_id)
          filter (where obligation.first_submitted_at is not null)::int
          as submitted_student_count
      from public.collection_obligations as obligation
      where obligation.form_id in (select id from scoped_forms)
        and obligation.status <> 'withdrawn'
    `;
    return this.mapCounts(rows[0]!);
  }

  private mapCounts(row: CountsRow): CollectionDeletionCounts {
    return {
      assignedStudentCount: row.assigned_student_count,
      formCount: row.form_count,
      groupCount: row.group_count,
      submittedStudentCount: row.submitted_student_count,
    };
  }
}
