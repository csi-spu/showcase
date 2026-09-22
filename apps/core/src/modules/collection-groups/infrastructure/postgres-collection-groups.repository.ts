import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  AddMembersByEntryYearResult,
  AddMembersResult,
  CollectionGroup,
  CollectionGroupsRepository,
  CollectionRound,
  GroupMember,
  MembershipSource,
  MembershipStatus,
  ReinstateMemberResult,
  WithdrawMemberResult,
} from '../application/collection-groups.ports';

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
  withdrawal_reason: string | null;
  withdrawn_at: Date | null;
}

interface EligibleStudentRow {
  account_id: string;
  entry_year: number;
  first_name_th: string;
  last_name_th: string;
  student_id_hash: string;
}

interface MembershipStateRow {
  added_at: Date;
  status: MembershipStatus;
  student_account_id: string;
}

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

  async createGroup(input: {
    createdByAccountId: string;
    name: string;
    now: Date;
    roundId: string;
  }): Promise<CollectionGroup> {
    const rows = await this.database.sql<GroupRow[]>`
      insert into public.collection_groups (round_id, name, created_by_account_id, created_at)
      values (${input.roundId}, ${input.name}, ${input.createdByAccountId}, ${input.now})
      returning id, round_id, name, created_at
    `;
    return this.mapGroup(rows[0]!);
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
        person_name.last_name_th
      from public.collection_group_memberships as membership
      join public.accounts as account on account.id = membership.student_account_id
      join public.students as student on student.person_id = account.person_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      where membership.group_id = ${groupId}
      order by membership.added_at desc
      limit 2000
    `;
    return rows.map((row) => this.mapMember(row));
  }

  async addMembersByStudentIdHashes(input: {
    actorAccountId: string;
    groupId: string;
    now: Date;
    source: 'individual' | 'student_id_list';
    studentIdHashToOriginal: Map<string, string>;
  }): Promise<AddMembersResult> {
    const hashes = [...input.studentIdHashToOriginal.keys()];
    return this.database.sql.begin(async (transaction) => {
      const eligible = await transaction<EligibleStudentRow[]>`
        select
          account.id as account_id,
          identity.student_id_hash,
          student.entry_year,
          person_name.first_name_th,
          person_name.last_name_th
        from private.student_auth_identities as identity
        join public.accounts as account on account.id = identity.account_id
        join public.account_roles as student_role
          on student_role.account_id = account.id and student_role.role = 'student'
        join public.students as student on student.person_id = account.person_id
        join private.person_names as person_name on person_name.person_id = account.person_id
        where identity.student_id_hash = any(${hashes}::text[])
          and account.status = 'active'
      `;

      const matchedHashes = new Set(eligible.map((row) => row.student_id_hash));
      const unknownStudentIds = [...input.studentIdHashToOriginal.entries()]
        .filter(([hash]) => !matchedHashes.has(hash))
        .map(([, original]) => original);

      if (eligible.length === 0) {
        return { accepted: [], alreadyWithdrawnStudentIds: [], unknownStudentIds };
      }

      const accountIds = eligible.map((row) => row.account_id);
      // A single set-based insert instead of one round trip per Student ID:
      // an existing membership row (current or withdrawn) is left untouched.
      await transaction`
        insert into public.collection_group_memberships (
          group_id, student_account_id, membership_source, added_by_account_id, added_at
        )
        select ${input.groupId}, unnest(${accountIds}::uuid[]), ${input.source}, ${input.actorAccountId}, ${input.now}
        on conflict (group_id, student_account_id) do nothing
      `;

      const memberships = await transaction<MembershipStateRow[]>`
        select student_account_id, status, added_at
        from public.collection_group_memberships
        where group_id = ${input.groupId} and student_account_id = any(${accountIds}::uuid[])
      `;
      await transaction`
        insert into public.collection_obligations (form_id, student_account_id, assigned_at)
        select form.id, membership.student_account_id, ${input.now}
        from public.collection_forms as form
        join public.collection_group_memberships as membership on membership.group_id = form.group_id
        where form.group_id = ${input.groupId} and form.status = 'open'
          and membership.student_account_id = any(${accountIds}::uuid[]) and membership.status = 'current'
        on conflict do nothing
      `;
      const membershipByAccountId = new Map(
        memberships.map((row) => [row.student_account_id, row] as const),
      );

      const accepted: GroupMember[] = [];
      const alreadyWithdrawnStudentIds: string[] = [];
      for (const row of eligible) {
        const membership = membershipByAccountId.get(row.account_id);
        if (membership === undefined) continue;
        // Reinstating a withdrawn Student is a separate, not-yet-defined
        // product decision -- re-adding them here must not silently claim
        // success while the membership stays withdrawn in the database.
        if (membership.status === 'withdrawn') {
          const originalStudentId = input.studentIdHashToOriginal.get(row.student_id_hash);
          if (originalStudentId !== undefined) alreadyWithdrawnStudentIds.push(originalStudentId);
          continue;
        }
        accepted.push({
          addedAt: membership.added_at,
          entryYear: row.entry_year,
          firstNameTh: row.first_name_th,
          lastNameTh: row.last_name_th,
          membershipSource: input.source,
          status: 'current',
          studentAccountId: row.account_id,
          withdrawalReason: null,
          withdrawnAt: null,
        });
      }

      return { accepted, alreadyWithdrawnStudentIds, unknownStudentIds };
    });
  }

  async addMembersByEntryYear(input: {
    actorAccountId: string;
    entryYear: number;
    groupId: string;
    now: Date;
  }): Promise<AddMembersByEntryYearResult> {
    return this.database.sql.begin(async (transaction) => {
      const eligible = await transaction<Omit<EligibleStudentRow, 'student_id_hash'>[]>`
        select account.id as account_id, student.entry_year, person_name.first_name_th, person_name.last_name_th
        from public.students as student
        join public.accounts as account on account.person_id = student.person_id
        join public.account_roles as student_role
          on student_role.account_id = account.id and student_role.role = 'student'
        join private.person_names as person_name on person_name.person_id = account.person_id
        where student.entry_year = ${input.entryYear}
          and account.status = 'active'
      `;

      if (eligible.length === 0) {
        return { accepted: [], alreadyWithdrawnCount: 0 };
      }

      const accountIds = eligible.map((row) => row.account_id);
      await transaction`
        insert into public.collection_group_memberships (
          group_id, student_account_id, membership_source, added_by_account_id, added_at
        )
        select ${input.groupId}, unnest(${accountIds}::uuid[]), 'entry_year', ${input.actorAccountId}, ${input.now}
        on conflict (group_id, student_account_id) do nothing
      `;

      const memberships = await transaction<MembershipStateRow[]>`
        select student_account_id, status, added_at
        from public.collection_group_memberships
        where group_id = ${input.groupId} and student_account_id = any(${accountIds}::uuid[])
      `;
      await transaction`
        insert into public.collection_obligations (form_id, student_account_id, assigned_at)
        select form.id, membership.student_account_id, ${input.now}
        from public.collection_forms as form
        join public.collection_group_memberships as membership on membership.group_id = form.group_id
        where form.group_id = ${input.groupId} and form.status = 'open'
          and membership.student_account_id = any(${accountIds}::uuid[]) and membership.status = 'current'
        on conflict do nothing
      `;
      const membershipByAccountId = new Map(
        memberships.map((row) => [row.student_account_id, row] as const),
      );

      const accepted: GroupMember[] = [];
      let alreadyWithdrawnCount = 0;
      for (const row of eligible) {
        const membership = membershipByAccountId.get(row.account_id);
        if (membership === undefined) continue;
        if (membership.status === 'withdrawn') {
          alreadyWithdrawnCount += 1;
          continue;
        }
        accepted.push({
          addedAt: membership.added_at,
          entryYear: row.entry_year,
          firstNameTh: row.first_name_th,
          lastNameTh: row.last_name_th,
          membershipSource: 'entry_year',
          status: 'current',
          studentAccountId: row.account_id,
          withdrawalReason: null,
          withdrawnAt: null,
        });
      }
      return { accepted, alreadyWithdrawnCount };
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
          person_name.last_name_th
        from public.collection_group_memberships as membership
        join public.accounts as account on account.id = membership.student_account_id
        join public.students as student on student.person_id = account.person_id
        join private.person_names as person_name on person_name.person_id = account.person_id
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
          person_name.last_name_th
        from public.collection_group_memberships as membership
        join public.accounts as account on account.id = membership.student_account_id
        join public.students as student on student.person_id = account.person_id
        join private.person_names as person_name on person_name.person_id = account.person_id
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
      withdrawalReason: row.withdrawal_reason,
      withdrawnAt: row.withdrawn_at,
    };
  }
}
