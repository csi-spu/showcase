import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type { PrismaQuery, PrismaSql } from '../../auth/infrastructure/prisma-sql';
import type {
  AddMembersResult,
  CollectionGroup,
  CollectionGroupsRepository,
  CollectionRound,
  CreateGroupWithMembersResult,
  CreateRoundWithGroupAndMembersResult,
  GroupMember,
  MembershipSource,
  MembershipStatus,
  ReinstateMemberResult,
  SelectableStudent,
  StudentSearch,
  StudentSelectionFilter,
  WithdrawMemberResult,
} from '../application/collection-groups.ports';
import { evaluateSelectionStatus } from '../domain/member-selection-policy';

interface RoundRow {
  created_at: Date;
  id: string;
  name: string;
  status: 'active' | 'closed';
}

interface GroupRow {
  created_at: Date;
  id: string;
  name: string;
  round_id: string;
}

interface MemberRow {
  added_at: Date;
  entry_year: number;
  first_name_th: string;
  last_name_th: string;
  membership_source: MembershipSource;
  status: MembershipStatus;
  student_account_id: string;
  student_id: string | null;
  withdrawal_reason: string | null;
  withdrawn_at: Date | null;
}

interface CandidateRow {
  access_ends_academic_year: number;
  account_id: string;
  current_academic_year: number | null;
  entry_year: number;
  first_name_th: string;
  last_name_th: string;
  membership_status: MembershipStatus | null;
  student_id: string | null;
}

type RoundStatusRow = { status: 'active' | 'closed' };

@Injectable()
export class PostgresCollectionGroupsRepository implements CollectionGroupsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async createRound(input: {
    createdByAccountId: string;
    name: string;
    now: Date;
  }): Promise<CollectionRound> {
    const rows = await this.database.sql<RoundRow[]>`
      insert into public.collection_rounds (name, created_by_account_id, created_at)
      values (${input.name}, ${input.createdByAccountId}, ${input.now})
      returning id, name, status, created_at
    `;
    return this.mapRound(rows[0]!);
  }

  async listRounds(): Promise<CollectionRound[]> {
    const rows = await this.database.sql<RoundRow[]>`
      select id, name, status, created_at
      from public.collection_rounds
      order by created_at desc
      limit 200
    `;
    return rows.map((row) => this.mapRound(row));
  }

  async findRound(roundId: string): Promise<CollectionRound | null> {
    const rows = await this.database.sql<RoundRow[]>`
      select id, name, status, created_at
      from public.collection_rounds
      where id = ${roundId}
      limit 1
    `;
    const row = rows[0];
    return row === undefined ? null : this.mapRound(row);
  }

  async findGroup(groupId: string): Promise<CollectionGroup | null> {
    const rows = await this.database.sql<GroupRow[]>`
      select id, round_id, name, created_at
      from public.collection_groups
      where id = ${groupId}
      limit 1
    `;
    const row = rows[0];
    return row === undefined ? null : this.mapGroup(row);
  }

  async listGroups(roundId: string): Promise<CollectionGroup[]> {
    const rows = await this.database.sql<GroupRow[]>`
      select id, round_id, name, created_at
      from public.collection_groups
      where round_id = ${roundId}
      order by created_at desc
      limit 200
    `;
    return rows.map((row) => this.mapGroup(row));
  }

  async listGroupMembers(groupId: string): Promise<GroupMember[]> {
    const rows = await this.database.sql<MemberRow[]>`
      select
        membership.student_account_id,
        membership.status,
        membership.membership_source,
        membership.added_at,
        membership.withdrawn_at,
        membership.withdrawal_reason,
        student.entry_year,
        person_name.first_name_th,
        person_name.last_name_th,
        identity.student_id
      from public.collection_group_memberships as membership
      join public.accounts as account on account.id = membership.student_account_id
      join public.students as student on student.person_id = account.person_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      left join private.student_auth_identities as identity on identity.account_id = account.id
      where membership.group_id = ${groupId}
      order by membership.added_at desc
      limit 2000
    `;
    return rows.map((row) => this.mapMember(row));
  }

  async listStudents(
    input: StudentSelectionFilter & { afterAccountId: string | null; limit: number },
  ): Promise<SelectableStudent[]> {
    const sql = this.database.sql;
    // Keyset pagination: the cursor Account's own sort key is looked up here,
    // so the cursor never has to carry a name.
    const after =
      input.afterAccountId === null
        ? sql``
        : sql`
            and (student.entry_year, person_name.first_name_th, person_name.last_name_th, account.id) > (
              select cursor_student.entry_year, cursor_name.first_name_th, cursor_name.last_name_th, cursor_account.id
              from public.accounts as cursor_account
              join public.students as cursor_student on cursor_student.person_id = cursor_account.person_id
              join private.person_names as cursor_name on cursor_name.person_id = cursor_account.person_id
              where cursor_account.id = ${input.afterAccountId}
            )
          `;
    const rows = await sql<CandidateRow[]>`
      ${this.candidateSelect(sql, input)}
      ${after}
      order by student.entry_year, person_name.first_name_th, person_name.last_name_th, account.id
      limit ${input.limit + 1}
    `;
    return rows.map((row) => this.mapCandidate(row));
  }

  async listSelectableStudentSnapshot(
    input: StudentSelectionFilter & { limit: number },
  ): Promise<SelectableStudent[]> {
    const sql = this.database.sql;
    const rows = await sql<CandidateRow[]>`
      ${this.candidateSelect(sql, input)}
      ${this.selectablePredicate(sql)}
      order by student.entry_year, person_name.first_name_th, person_name.last_name_th, account.id
      limit ${input.limit}
    `;
    return rows
      .map((row) => this.mapCandidate(row))
      .filter((student) => student.status === 'selectable');
  }

  async countSelectableStudents(filter: StudentSelectionFilter): Promise<number> {
    const sql = this.database.sql;
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from (
        ${this.candidateSelect(sql, filter)}
        ${this.selectablePredicate(sql)}
      ) as matching
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async listEntryYears(): Promise<number[]> {
    const rows = await this.database.sql<{ entry_year: number }[]>`
      select distinct student.entry_year
      from public.students as student
      join public.accounts as account on account.person_id = student.person_id
      join public.account_roles as student_role
        on student_role.account_id = account.id and student_role.role = 'student'
      where account.status = 'active'
      order by student.entry_year desc
      limit 200
    `;
    return rows.map((row) => row.entry_year);
  }

  async findCurrentAcademicYear(): Promise<number | null> {
    const rows = await this.database.sql<{ current_academic_year: number | null }[]>`
      select current_academic_year
      from public.academic_settings
      where singleton = true
    `;
    return rows[0]?.current_academic_year ?? null;
  }

  async findStudentsByIdHashes(input: {
    groupId: string | null;
    studentIdHashes: string[];
  }): Promise<Map<string, SelectableStudent>> {
    const sql = this.database.sql;
    // The hash stays inside Core: it keys the result for the caller and is
    // never mapped into a SelectableStudent.
    const rows = await sql<(CandidateRow & { student_id_hash: string })[]>`
      select
        identity.student_id_hash,
        ${this.candidateColumns(sql)}
      ${this.candidateFrom(sql, input.groupId)}
      where account.status = 'active'
        and identity.student_id_hash = any(${input.studentIdHashes}::text[])
    `;
    return new Map(rows.map((row) => [row.student_id_hash, this.mapCandidate(row)] as const));
  }

  async createGroupWithMembers(input: {
    createdByAccountId: string;
    idempotencyKey: string;
    memberAccountIds: string[];
    name: string;
    now: Date;
    roundId: string;
  }): Promise<CreateGroupWithMembersResult> {
    return this.database.sql.begin(async (transaction) => {
      const existing = await this.claimCreation(
        transaction,
        input.createdByAccountId,
        input.idempotencyKey,
      );
      if (existing !== null) {
        return existing.roundId === input.roundId && existing.name === input.name
          ? { group: existing, outcome: 'replayed' }
          : { outcome: 'idempotency_conflict' };
      }

      const roundStatus = await this.lockRound(
        transaction,
        transaction`where round.id = ${input.roundId}`,
      );
      if (roundStatus === null) return { outcome: 'round_not_found' };
      if (roundStatus === 'closed') return { outcome: 'round_closed' };

      const selection = await this.recheckSelection(transaction, null, input.memberAccountIds);
      if (selection.ineligibleAccountIds.length > 0) {
        return { accountIds: selection.ineligibleAccountIds, outcome: 'members_not_selectable' };
      }

      const groupRows = await transaction<GroupRow[]>`
        insert into public.collection_groups
          (round_id, name, created_by_account_id, created_at, creation_idempotency_key)
        values
          (${input.roundId}, ${input.name}, ${input.createdByAccountId}, ${input.now}, ${input.idempotencyKey})
        returning id, round_id, name, created_at
      `;
      const group = this.mapGroup(groupRows[0]!);
      // A new Group has no forms yet, so there are no obligations to assign.
      await this.insertMemberships(transaction, {
        actorAccountId: input.createdByAccountId,
        accountIds: input.memberAccountIds,
        groupId: group.id,
        now: input.now,
      });
      return { group, outcome: 'created' };
    });
  }

  async createRoundWithGroupAndMembers(input: {
    createdByAccountId: string;
    groupName: string;
    idempotencyKey: string;
    memberAccountIds: string[];
    now: Date;
    roundName: string;
  }): Promise<CreateRoundWithGroupAndMembersResult> {
    return this.database.sql.begin(async (transaction) => {
      const existing = await this.claimCreation(
        transaction,
        input.createdByAccountId,
        input.idempotencyKey,
      );
      if (existing !== null) {
        const roundRows = await transaction<RoundRow[]>`
          select id, name, status, created_at
          from public.collection_rounds
          where id = ${existing.roundId}
        `;
        const round = this.mapRound(roundRows[0]!);
        return round.name === input.roundName && existing.name === input.groupName
          ? { group: existing, outcome: 'replayed', round }
          : { outcome: 'idempotency_conflict' };
      }

      const selection = await this.recheckSelection(transaction, null, input.memberAccountIds);
      if (selection.ineligibleAccountIds.length > 0) {
        return { accountIds: selection.ineligibleAccountIds, outcome: 'members_not_selectable' };
      }

      const roundRows = await transaction<RoundRow[]>`
        insert into public.collection_rounds (name, created_by_account_id, created_at)
        values (${input.roundName}, ${input.createdByAccountId}, ${input.now})
        returning id, name, status, created_at
      `;
      const round = this.mapRound(roundRows[0]!);
      const groupRows = await transaction<GroupRow[]>`
        insert into public.collection_groups
          (round_id, name, created_by_account_id, created_at, creation_idempotency_key)
        values
          (${round.id}, ${input.groupName}, ${input.createdByAccountId}, ${input.now}, ${input.idempotencyKey})
        returning id, round_id, name, created_at
      `;
      const group = this.mapGroup(groupRows[0]!);
      await this.insertMemberships(transaction, {
        actorAccountId: input.createdByAccountId,
        accountIds: input.memberAccountIds,
        groupId: group.id,
        now: input.now,
      });
      return { group, outcome: 'created', round };
    });
  }

  async addMembers(input: {
    actorAccountId: string;
    groupId: string;
    memberAccountIds: string[];
    now: Date;
  }): Promise<AddMembersResult> {
    return this.database.sql.begin(async (transaction) => {
      const roundStatus = await this.lockRound(
        transaction,
        transaction`where round.id = (select round_id from public.collection_groups where id = ${input.groupId})`,
      );
      if (roundStatus === 'closed') return { outcome: 'round_closed' };

      const selection = await this.recheckSelection(
        transaction,
        input.groupId,
        input.memberAccountIds,
      );
      if (selection.ineligibleAccountIds.length > 0) {
        return { accountIds: selection.ineligibleAccountIds, outcome: 'members_not_selectable' };
      }

      const inserted = await this.insertMemberships(transaction, {
        actorAccountId: input.actorAccountId,
        accountIds: selection.selectableAccountIds,
        groupId: input.groupId,
        now: input.now,
      });
      if (inserted.length > 0) {
        // New members owe every form that is open when they join.
        await transaction`
          insert into public.collection_obligations (form_id, student_account_id, assigned_at)
          select form.id, inserted.account_id, ${input.now}
          from public.collection_forms as form
          cross join unnest(${inserted}::uuid[]) as inserted(account_id)
          where form.group_id = ${input.groupId} and form.status = 'open'
          on conflict do nothing
        `;
      }
      return {
        added: inserted.length,
        alreadyMember: input.memberAccountIds.length - inserted.length,
        outcome: 'added',
      };
    });
  }

  async withdrawMember(input: {
    actorAccountId: string;
    groupId: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<WithdrawMemberResult> {
    return this.database.sql.begin(async (transaction) => {
      const rounds = await transaction<{ status: 'active' | 'closed' }[]>`
        select round.status
        from public.collection_rounds as round
        join public.collection_groups as collection_group on collection_group.round_id = round.id
        where collection_group.id = ${input.groupId}
        for update of round
      `;
      if (rounds[0]?.status === 'closed') return { outcome: 'round_closed' };
      // Only a currently-active membership is transitioned; a retry against
      // an already-withdrawn membership must not overwrite the original
      // actor/time/reason with a second, unrelated withdrawal request.
      const justWithdrawn = await transaction<{ student_account_id: string }[]>`
        update public.collection_group_memberships
        set status = 'withdrawn',
            withdrawn_by_account_id = ${input.actorAccountId},
            withdrawn_at = ${input.now},
            withdrawal_reason = ${input.reason}
        where group_id = ${input.groupId}
          and student_account_id = ${input.studentAccountId}
          and status = 'current'
        returning student_account_id
      `;

      if (justWithdrawn.length > 0) {
        await transaction`
          update public.collection_obligations as obligation
          set status_before_withdrawal = obligation.status, status = 'withdrawn'
          from public.collection_forms as form
          where obligation.form_id = form.id and form.group_id = ${input.groupId}
            and obligation.student_account_id = ${input.studentAccountId}
            and obligation.status <> 'withdrawn'
        `;
        await transaction`
          insert into private.collection_membership_audit_events
            (group_id, student_account_id, actor_account_id, action, reason, occurred_at)
          values (${input.groupId}, ${input.studentAccountId}, ${input.actorAccountId}, 'withdrawn', ${input.reason}, ${input.now})
        `;
      }

      const rows = await transaction<MemberRow[]>`
        select
          membership.student_account_id,
          membership.status,
          membership.membership_source,
          membership.added_at,
          membership.withdrawn_at,
          membership.withdrawal_reason,
          student.entry_year,
          person_name.first_name_th,
          person_name.last_name_th,
          identity.student_id
        from public.collection_group_memberships as membership
        join public.accounts as account on account.id = membership.student_account_id
        join public.students as student on student.person_id = account.person_id
        join private.person_names as person_name on person_name.person_id = account.person_id
        left join private.student_auth_identities as identity on identity.account_id = account.id
        where membership.group_id = ${input.groupId}
          and membership.student_account_id = ${input.studentAccountId}
        limit 1
      `;
      const row = rows[0];
      if (row === undefined) {
        return { outcome: 'not_found' };
      }
      return {
        member: this.mapMember(row),
        outcome: justWithdrawn.length > 0 ? 'withdrawn' : 'already_withdrawn',
      };
    });
  }

  async reinstateMember(input: {
    actorAccountId: string;
    groupId: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<ReinstateMemberResult> {
    return this.database.sql.begin(async (transaction) => {
      const rounds = await transaction<{ status: 'active' | 'closed' }[]>`
        select round.status
        from public.collection_rounds as round
        join public.collection_groups as collection_group on collection_group.round_id = round.id
        where collection_group.id = ${input.groupId}
        for update of round
      `;
      if (rounds[0]?.status === 'closed') return { outcome: 'round_closed' };

      const updated = await transaction<{ student_account_id: string }[]>`
        update public.collection_group_memberships as membership
        set status = 'current',
            withdrawn_by_account_id = null,
            withdrawn_at = null,
            withdrawal_reason = null
        from public.accounts as account
        where membership.group_id = ${input.groupId}
          and membership.student_account_id = ${input.studentAccountId}
          and membership.status = 'withdrawn'
          and account.id = membership.student_account_id
          and account.status = 'active'
        returning membership.student_account_id
      `;

      const rows = await transaction<(MemberRow & { account_status: string })[]>`
        select
          membership.student_account_id,
          membership.status,
          membership.membership_source,
          membership.added_at,
          membership.withdrawn_at,
          membership.withdrawal_reason,
          account.status as account_status,
          student.entry_year,
          person_name.first_name_th,
          person_name.last_name_th,
          identity.student_id
        from public.collection_group_memberships as membership
        join public.accounts as account on account.id = membership.student_account_id
        join public.students as student on student.person_id = account.person_id
        join private.person_names as person_name on person_name.person_id = account.person_id
        left join private.student_auth_identities as identity on identity.account_id = account.id
        where membership.group_id = ${input.groupId}
          and membership.student_account_id = ${input.studentAccountId}
        limit 1
      `;
      const row = rows[0];
      if (row === undefined) return { outcome: 'not_found' };
      if (updated.length === 0) {
        if (row.account_status !== 'active') return { outcome: 'student_inactive' };
        return { member: this.mapMember(row), outcome: 'already_current' };
      }

      await transaction`
        insert into private.collection_membership_audit_events
          (group_id, student_account_id, actor_account_id, action, reason, occurred_at)
        values (${input.groupId}, ${input.studentAccountId}, ${input.actorAccountId}, 'reinstated', ${input.reason}, ${input.now})
      `;
      await transaction`
        update public.collection_obligations as obligation
        set status = coalesce(obligation.status_before_withdrawal, 'not_submitted'),
            status_before_withdrawal = null
        from public.collection_forms as form
        where obligation.form_id = form.id and form.group_id = ${input.groupId}
          and obligation.student_account_id = ${input.studentAccountId}
          and obligation.status = 'withdrawn'
      `;
      await transaction`
        insert into public.collection_obligations (form_id, student_account_id, assigned_at)
        select id, ${input.studentAccountId}, ${input.now}
        from public.collection_forms
        where group_id = ${input.groupId} and status = 'open'
        on conflict do nothing
      `;
      return { member: this.mapMember(row), outcome: 'reinstated' };
    });
  }

  /*
   * Serializes retries of one creation and returns the Group it already
   * produced, if any. The unique index backs this up; the lock turns a
   * concurrent duplicate into a replay instead of a constraint violation.
   */
  private async claimCreation(
    transaction: PrismaSql,
    actorAccountId: string,
    idempotencyKey: string,
  ): Promise<CollectionGroup | null> {
    await transaction`
      select 1 from (
        select pg_advisory_xact_lock(
          hashtextextended(${actorAccountId}::text || ':' || ${idempotencyKey}::text, 0)
        )
      ) as advisory_lock
    `;
    const rows = await transaction<GroupRow[]>`
      select id, round_id, name, created_at
      from public.collection_groups
      where created_by_account_id = ${actorAccountId}
        and creation_idempotency_key = ${idempotencyKey}
    `;
    const row = rows[0];
    return row === undefined ? null : this.mapGroup(row);
  }

  /* Holds the Round open for the rest of the transaction; closing it waits. */
  private async lockRound(
    transaction: PrismaSql,
    where: PrismaQuery<unknown[]>,
  ): Promise<'active' | 'closed' | null> {
    const rows = await transaction<RoundStatusRow[]>`
      select round.status from public.collection_rounds as round ${where} for share
    `;
    return rows[0]?.status ?? null;
  }

  /*
   * Rechecks every requested Account at confirmation. Anyone missing, no
   * longer eligible, or withdrawn rejects the whole request; a concurrent
   * current member is skipped rather than failed.
   */
  private async recheckSelection(
    transaction: PrismaSql,
    groupId: string | null,
    accountIds: string[],
  ): Promise<{ ineligibleAccountIds: string[]; selectableAccountIds: string[] }> {
    const rows = await transaction<CandidateRow[]>`
      select ${this.candidateColumns(transaction)}
      ${this.candidateFrom(transaction, groupId)}
      where account.status = 'active'
        and account.id = any(${accountIds}::uuid[])
      for share of account
    `;
    const statusByAccountId = new Map(
      rows.map((row) => [row.account_id, this.mapCandidate(row).status] as const),
    );
    const ineligibleAccountIds: string[] = [];
    const selectableAccountIds: string[] = [];
    for (const accountId of accountIds) {
      const status = statusByAccountId.get(accountId);
      if (status === 'selectable') selectableAccountIds.push(accountId);
      else if (status !== 'current_member') ineligibleAccountIds.push(accountId);
    }
    return { ineligibleAccountIds, selectableAccountIds };
  }

  /* One set-based insert; returns the Accounts that actually became members. */
  private async insertMemberships(
    transaction: PrismaSql,
    input: { actorAccountId: string; accountIds: string[]; groupId: string; now: Date },
  ): Promise<string[]> {
    if (input.accountIds.length === 0) return [];
    const rows = await transaction<{ student_account_id: string }[]>`
      insert into public.collection_group_memberships (
        group_id, student_account_id, membership_source, added_by_account_id, added_at
      )
      select ${input.groupId}, requested.account_id, 'instructor_selection', ${input.actorAccountId}, ${input.now}
      from unnest(${input.accountIds}::uuid[]) as requested(account_id)
      on conflict (group_id, student_account_id) do nothing
      returning student_account_id
    `;
    return rows.map((row) => row.student_account_id);
  }

  private candidateColumns(sql: PrismaSql): PrismaQuery<unknown[]> {
    return sql`
      account.id as account_id,
      student.entry_year,
      student.access_ends_academic_year,
      settings.current_academic_year,
      person_name.first_name_th,
      person_name.last_name_th,
      membership.status as membership_status,
      identity.student_id
    `;
  }

  /* Active Accounts holding the Student role, with add-flow membership when a Group is given. */
  private candidateFrom(sql: PrismaSql, groupId: string | null): PrismaQuery<unknown[]> {
    const membershipJoin =
      groupId === null
        ? sql`left join public.collection_group_memberships as membership on false`
        : sql`
            left join public.collection_group_memberships as membership
              on membership.group_id = ${groupId} and membership.student_account_id = account.id
          `;
    return sql`
      from public.accounts as account
      join public.account_roles as student_role
        on student_role.account_id = account.id and student_role.role = 'student'
      join public.students as student on student.person_id = account.person_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      left join private.student_auth_identities as identity on identity.account_id = account.id
      left join public.academic_settings as settings on settings.singleton = true
      ${membershipJoin}
    `;
  }

  private candidateSelect(sql: PrismaSql, filter: StudentSelectionFilter): PrismaQuery<unknown[]> {
    const entryYear =
      filter.entryYear === null ? sql`` : sql`and student.entry_year = ${filter.entryYear}`;
    return sql`
      select ${this.candidateColumns(sql)}
      ${this.candidateFrom(sql, filter.groupId)}
      where account.status = 'active'
      ${entryYear}
      ${this.searchPredicate(sql, filter.search)}
    `;
  }

  private searchPredicate(sql: PrismaSql, search: StudentSearch | null): PrismaQuery<unknown[]> {
    if (search === null) return sql``;
    if (search.kind === 'name') {
      // Matches the trigram index expression and predicate on private.person_names.
      return sql`
        and person_name.first_name_th is not null and person_name.last_name_th is not null
        and lower(person_name.first_name_th || ' ' || person_name.last_name_th)
          like ${`%${escapeLike(search.name.toLowerCase())}%`} escape '\\'
      `;
    }
    // A full Student ID is its own hash; shorter prefixes use the prefix index.
    if (search.prefixLength === 8) {
      return sql`and identity.student_id_hash = ${search.prefixHash}`;
    }
    return sql`
      and exists (
        select 1 from private.student_id_search_prefixes as prefix
        where prefix.account_id = account.id
          and prefix.prefix_hash = ${search.prefixHash}
          and prefix.prefix_length = ${search.prefixLength}
      )
    `;
  }

  /* SQL form of evaluateSelectionStatus(...) === 'selectable', for bounded snapshots and counts. */
  private selectablePredicate(sql: PrismaSql): PrismaQuery<unknown[]> {
    return sql`
      and settings.current_academic_year is not null
      and settings.current_academic_year between student.entry_year and student.access_ends_academic_year
      and membership.student_account_id is null
    `;
  }

  private mapCandidate(row: CandidateRow): SelectableStudent {
    return {
      accountId: row.account_id,
      entryYear: row.entry_year,
      firstNameTh: row.first_name_th,
      lastNameTh: row.last_name_th,
      status: evaluateSelectionStatus({
        accessEndsAcademicYear: row.access_ends_academic_year,
        currentAcademicYear: row.current_academic_year,
        entryYear: row.entry_year,
        membershipStatus: row.membership_status,
      }),
      studentId: row.student_id,
    };
  }

  private mapRound(row: RoundRow): CollectionRound {
    return { createdAt: row.created_at, id: row.id, name: row.name, status: row.status };
  }

  private mapGroup(row: GroupRow): CollectionGroup {
    return { createdAt: row.created_at, id: row.id, name: row.name, roundId: row.round_id };
  }

  private mapMember(row: MemberRow): GroupMember {
    return {
      addedAt: row.added_at,
      entryYear: row.entry_year,
      firstNameTh: row.first_name_th,
      lastNameTh: row.last_name_th,
      membershipSource: row.membership_source,
      status: row.status,
      studentAccountId: row.student_account_id,
      studentId: row.student_id,
      withdrawalReason: row.withdrawal_reason,
      withdrawnAt: row.withdrawn_at,
    };
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}
