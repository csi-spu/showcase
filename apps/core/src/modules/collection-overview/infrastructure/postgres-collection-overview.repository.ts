import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import { encodeAttentionCursor } from '../application/collection-attention-cursor';
import type {
  CollectionFilterOptions,
  CollectionOverview,
  CollectionOverviewQuery,
  CollectionOverviewRepository,
  CollectionOverviewScope,
  CollectionStudentAttentionPage,
  CollectionStudentAttentionQuery,
  CollectionStudentAttentionStatus,
} from '../application/collection-overview.ports';

interface OverviewTotalsRow {
  active_groups: number;
  active_rounds: number;
  active_students: number;
  closed_rounds: number;
  students_fully_complete: number;
  students_partially_complete: number;
  students_with_no_submission: number;
  students_with_obligations: number;
  submissions_pending_review: number;
}

interface AttentionRow {
  deadline_at: Date | null;
  form_id: string;
  form_title: string;
  group_id: string;
  group_name: string;
  pending_review_count: number;
  round_id: string;
  round_name: string;
  students_not_submitted: number;
}

interface UpcomingRow {
  deadline_at: Date;
  form_id: string;
  form_title: string;
  group_id: string;
  group_name: string;
  round_id: string;
  round_name: string;
  students_not_submitted: number;
}

interface ProgressRow {
  completed_students: number;
  deadline_at: Date | null;
  form_id: string;
  form_title: string;
  group_id: string;
  group_name: string;
  round_id: string;
  round_name: string;
  total_students: number;
}

interface StudentAttentionRow {
  deadline_at: Date | null;
  first_name_th: string;
  form_id: string;
  form_title: string;
  group_id: string;
  group_name: string;
  last_name_th: string;
  obligation_status: CollectionStudentAttentionStatus;
  round_id: string;
  round_name: string;
  student_account_id: string;
  student_id: string | null;
}

interface FilterRoundRow {
  id: string;
  name: string;
  status: string;
}

interface FilterGroupRow {
  id: string;
  name: string;
  round_id: string;
}

interface EntryYearRow {
  entry_year: number;
}

@Injectable()
export class PostgresCollectionOverviewRepository implements CollectionOverviewRepository {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * The Instructor landing page, as four bounded reads over one scope.
   *
   * The totals, the backlog list, the deadline rail and the progress bars ask
   * different questions of the same active-round population, so each is its own
   * statement rather than one cross join that would multiply rows. None of them
   * reads a Student name or any Student ID material.
   */
  async getOverview(query: CollectionOverviewQuery): Promise<CollectionOverview> {
    const { scope } = query;
    const [totalsRows, attentionRows, upcomingRows, progressRows] = await Promise.all([
      this.database.sql<OverviewTotalsRow[]>`
        ${this.scopeCte(scope)},
        student_state as (
          select obligation.student_account_id,
            bool_and(obligation.status = 'passed') as all_passed,
            bool_or(obligation.status = 'passed'
              or obligation.first_submitted_at is not null) as any_progress
          from scoped_obligations as obligation
          group by obligation.student_account_id
        )
        select
          (select count(*) filter (where status = 'active')::int
            from public.collection_rounds where deletion_id is null) as active_rounds,
          (select count(*) filter (where status = 'closed')::int
            from public.collection_rounds where deletion_id is null) as closed_rounds,
          (select count(*)::int from scoped_groups) as active_groups,
          (select count(distinct student_account_id)::int from scoped_memberships)
            as active_students,
          (select count(*)::int from scoped_obligations
            where status = 'awaiting_checking') as submissions_pending_review,
          (select count(*)::int from student_state) as students_with_obligations,
          (select count(*)::int from student_state where all_passed)
            as students_fully_complete,
          (select count(*)::int from student_state
            where not all_passed and any_progress) as students_partially_complete,
          (select count(*)::int from student_state where not any_progress)
            as students_with_no_submission
      `,
      this.database.sql<AttentionRow[]>`
        ${this.scopeCte(scope)}
        select form.id as form_id, form.title as form_title, form.deadline_at,
          form.group_id, form.group_name, form.round_id, form.round_name,
          count(*) filter (where obligation.status = 'awaiting_checking')::int
            as pending_review_count,
          count(*) filter (where obligation.status = 'not_submitted')::int
            as students_not_submitted
        from scoped_forms as form
        left join scoped_obligations as obligation on obligation.form_id = form.id
        group by form.id, form.title, form.deadline_at, form.group_id,
          form.group_name, form.round_id, form.round_name
        having count(*) filter (where obligation.status = 'awaiting_checking') > 0
        order by pending_review_count desc, form.deadline_at asc nulls last, form.id
        limit ${query.attentionLimit}
      `,
      /*
       * Forms whose deadline is still ahead. A form without a deadline cannot
       * be close to one, so `deadline_at is not null` is a filter here rather
       * than a nulls-last ordering.
       */
      this.database.sql<UpcomingRow[]>`
        ${this.scopeCte(scope)}
        select form.id as form_id, form.title as form_title, form.deadline_at,
          form.group_id, form.group_name, form.round_id, form.round_name,
          count(*) filter (where obligation.status not in ('passed', 'withdrawn'))::int
            as students_not_submitted
        from scoped_forms as form
        left join scoped_obligations as obligation on obligation.form_id = form.id
        where form.deadline_at is not null and form.deadline_at > now()
        group by form.id, form.title, form.deadline_at, form.group_id,
          form.group_name, form.round_id, form.round_name
        order by form.deadline_at asc, form.id
        limit ${query.upcomingLimit}
      `,
      this.database.sql<ProgressRow[]>`
        ${this.scopeCte(scope)}
        select form.id as form_id, form.title as form_title, form.deadline_at,
          form.group_id, form.group_name, form.round_id, form.round_name,
          count(*) filter (where obligation.status = 'passed')::int as completed_students,
          count(obligation.student_account_id)::int as total_students
        from scoped_forms as form
        left join scoped_obligations as obligation on obligation.form_id = form.id
        where form.status = 'open'
        group by form.id, form.title, form.deadline_at, form.group_id,
          form.group_name, form.round_id, form.round_name
        order by form.deadline_at asc nulls last, form.id
        limit ${query.progressLimit}
      `,
    ]);

    const totals = totalsRows[0];
    if (totals === undefined) {
      throw new Error('COLLECTION_OVERVIEW_QUERY_EMPTY');
    }

    return {
      activeFormProgress: progressRows.map((row) => ({
        completedStudents: row.completed_students,
        deadlineAt: row.deadline_at,
        formId: row.form_id,
        formTitle: row.form_title,
        groupId: row.group_id,
        groupName: row.group_name,
        roundId: row.round_id,
        roundName: row.round_name,
        totalStudents: row.total_students,
      })),
      activeRoundTotals: {
        groups: totals.active_groups,
        students: totals.active_students,
        studentsFullyComplete: totals.students_fully_complete,
        studentsPartiallyComplete: totals.students_partially_complete,
        studentsWithNoSubmission: totals.students_with_no_submission,
        studentsWithObligations: totals.students_with_obligations,
        submissionsPendingReview: totals.submissions_pending_review,
      },
      needsAttention: attentionRows.map((row) => ({
        deadlineAt: row.deadline_at,
        formId: row.form_id,
        formTitle: row.form_title,
        groupId: row.group_id,
        groupName: row.group_name,
        roundId: row.round_id,
        roundName: row.round_name,
        studentsNotSubmitted: row.students_not_submitted,
        submissionsPendingReview: row.pending_review_count,
      })),
      roundCounts: { active: totals.active_rounds, closed: totals.closed_rounds },
      upcomingDeadlines: upcomingRows.map((row) => ({
        deadlineAt: row.deadline_at,
        formId: row.form_id,
        formTitle: row.form_title,
        groupId: row.group_id,
        groupName: row.group_name,
        roundId: row.round_id,
        roundName: row.round_name,
        studentsNotSubmitted: row.students_not_submitted,
      })),
    };
  }

  /**
   * One cursor page of outstanding obligations, with Roster names.
   *
   * `passed` and `withdrawn` are excluded: neither is owed. Lateness is
   * computed in SQL against `now()` because every row here is unsubmitted or
   * sent back, so the question is whether the deadline has passed, not whether
   * a submission beat it.
   *
   * One extra row is read to decide `nextCursor` without a second count query.
   */
  async getStudentAttention(
    query: CollectionStudentAttentionQuery,
  ): Promise<CollectionStudentAttentionPage> {
    const { cursor, scope } = query;
    const rows = await this.database.sql<StudentAttentionRow[]>`
      ${this.scopeCte(scope)}
      select obligation.student_account_id, obligation.status as obligation_status,
        form.id as form_id, form.title as form_title, form.deadline_at,
        form.group_id, form.group_name, form.round_id, form.round_name,
        person_name.first_name_th, person_name.last_name_th, identity.student_id
      from scoped_obligations as obligation
      join scoped_forms as form on form.id = obligation.form_id
      join public.accounts as account on account.id = obligation.student_account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      left join private.student_auth_identities as identity on identity.account_id = account.id
      where obligation.status not in ('passed', 'withdrawn')
        and (
          ${cursor === null}
          or (
            /*
             * Resume after the last row shown, in the same order the query
             * sorts by. Nulls-last is expressed as a sortable pair so the
             * comparison stays a single row-value test: a null deadline is
             * mapped to 1 and therefore always follows a real one.
             */
            (
              case when form.deadline_at is null then 1 else 0 end,
              coalesce(form.deadline_at, 'epoch'::timestamptz),
              form.id,
              obligation.student_account_id
            ) > (
              case when ${cursor?.deadlineAt ?? null}::timestamptz is null then 1 else 0 end,
              coalesce(${cursor?.deadlineAt ?? null}::timestamptz, 'epoch'::timestamptz),
              ${cursor?.formId ?? null}::uuid,
              ${cursor?.studentAccountId ?? null}::uuid
            )
          )
        )
      order by form.deadline_at asc nulls last, form.id, obligation.student_account_id
      limit ${query.limit + 1}
    `;

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const now = Date.now();
    const last = pageRows.at(-1);

    return {
      nextCursor:
        hasMore && last !== undefined
          ? encodeAttentionCursor({
              deadlineAt: last.deadline_at,
              formId: last.form_id,
              studentAccountId: last.student_account_id,
            })
          : null,
      rows: pageRows.map((row) => ({
        deadlineAt: row.deadline_at,
        firstNameTh: row.first_name_th,
        formId: row.form_id,
        formTitle: row.form_title,
        groupId: row.group_id,
        groupName: row.group_name,
        isLate: row.deadline_at !== null && row.deadline_at.getTime() < now,
        lastNameTh: row.last_name_th,
        roundId: row.round_id,
        roundName: row.round_name,
        status: row.obligation_status,
        studentAccountId: row.student_account_id,
        studentId: row.student_id,
      })),
    };
  }

  /**
   * Source lists for the dashboard dropdowns.
   *
   * Entry Years come from `students`, the only place the cohort is durably
   * recorded, and are restricted to Students who are actually in an active
   * round so the filter cannot offer a year that yields nothing.
   */
  async getFilterOptions(limits: {
    groupLimit: number;
    roundLimit: number;
  }): Promise<CollectionFilterOptions> {
    const [roundRows, groupRows, entryYearRows] = await Promise.all([
      this.database.sql<FilterRoundRow[]>`
        select id, name, status
        from public.collection_rounds
        where deletion_id is null
        order by status = 'active' desc, created_at desc
        limit ${limits.roundLimit}
      `,
      this.database.sql<FilterGroupRow[]>`
        select collection_group.id, collection_group.name, collection_group.round_id
        from public.collection_groups as collection_group
        join public.collection_rounds as round on round.id = collection_group.round_id
        where collection_group.deletion_id is null
        order by round.status = 'active' desc, collection_group.created_at desc
        limit ${limits.groupLimit}
      `,
      this.database.sql<EntryYearRow[]>`
        select distinct student.entry_year
        from public.students as student
        join public.accounts as account on account.person_id = student.person_id
        join public.collection_group_memberships as membership
          on membership.student_account_id = account.id
          and membership.status = 'current'
        join public.collection_groups as collection_group
          on collection_group.id = membership.group_id
          and collection_group.deletion_id is null
        join public.collection_rounds as round
          on round.id = collection_group.round_id and round.status = 'active'
        order by student.entry_year desc
      `,
    ]);

    return {
      entryYears: entryYearRows.map((row) => row.entry_year),
      groups: groupRows.map((row) => ({
        id: row.id,
        name: row.name,
        roundId: row.round_id,
      })),
      rounds: roundRows.map((row) => ({ id: row.id, name: row.name, status: row.status })),
    };
  }

  /**
   * The scoped population every dashboard read starts from.
   *
   * Each filter is applied where it belongs: the round and group narrow the
   * groups, while the Entry Year narrows the memberships, so selecting a cohort
   * shrinks the counts inside a form instead of removing the form.
   */
  private scopeCte(scope: CollectionOverviewScope) {
    return this.database.sql`
      with scoped_groups as (
        select collection_group.id, collection_group.name,
          round.id as round_id, round.name as round_name
        from public.collection_groups as collection_group
        join public.collection_rounds as round on round.id = collection_group.round_id
        where (
          case when ${scope.roundId}::uuid is null then round.status = 'active'
          else round.id = ${scope.roundId}::uuid end
        )
        and (${scope.groupId}::uuid is null or collection_group.id = ${scope.groupId}::uuid)
        /* A live group always has a live round, so this hides a deleted round too. */
        and collection_group.deletion_id is null
      ),
      scoped_memberships as (
        select membership.group_id, membership.student_account_id
        from public.collection_group_memberships as membership
        join scoped_groups on scoped_groups.id = membership.group_id
        where membership.status = 'current'
          and (
            ${scope.entryYear}::smallint is null
            or exists (
              select 1
              from public.accounts as account
              join public.students as student on student.person_id = account.person_id
              where account.id = membership.student_account_id
                and student.entry_year = ${scope.entryYear}::smallint
            )
          )
      ),
      scoped_forms as (
        select form.id, form.group_id, form.title, form.deadline_at, form.status,
          scoped_groups.name as group_name,
          scoped_groups.round_id, scoped_groups.round_name
        from public.collection_forms as form
        join scoped_groups on scoped_groups.id = form.group_id
        where form.status <> 'draft' and form.deletion_id is null
      ),
      scoped_obligations as (
        select obligation.form_id, obligation.student_account_id,
          obligation.status, obligation.first_submitted_at
        from public.collection_obligations as obligation
        join scoped_forms on scoped_forms.id = obligation.form_id
        join scoped_memberships as membership
          on membership.group_id = scoped_forms.group_id
          and membership.student_account_id = obligation.student_account_id
      )
    `;
  }
}
