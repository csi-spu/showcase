import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { decodeAttentionCursor } from '../src/modules/collection-overview/application/collection-attention-cursor';
import { PostgresCollectionOverviewRepository } from '../src/modules/collection-overview/infrastructure/postgres-collection-overview.repository';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ACTOR_PERSON = '5c000000-0000-4000-8000-000000000001';
const ACTOR_ACCOUNT = '5c000000-0000-4000-8000-000000000002';
const STUDENT_A_PERSON = '5c000000-0000-4000-8000-000000000011';
const STUDENT_A_ACCOUNT = '5c000000-0000-4000-8000-000000000012';
const STUDENT_B_PERSON = '5c000000-0000-4000-8000-000000000021';
const STUDENT_B_ACCOUNT = '5c000000-0000-4000-8000-000000000022';
const STUDENT_C_PERSON = '5c000000-0000-4000-8000-000000000031';
const STUDENT_C_ACCOUNT = '5c000000-0000-4000-8000-000000000032';
const ACTIVE_ROUND = '5c000000-0000-4000-8000-000000000101';
const CLOSED_ROUND = '5c000000-0000-4000-8000-000000000102';
const GROUP_ONE = '5c000000-0000-4000-8000-000000000201';
const GROUP_TWO = '5c000000-0000-4000-8000-000000000202';
const CLOSED_GROUP = '5c000000-0000-4000-8000-000000000203';
const FORM_ONE = '5c000000-0000-4000-8000-000000000301';
const FORM_TWO = '5c000000-0000-4000-8000-000000000302';
const CLOSED_FORM = '5c000000-0000-4000-8000-000000000303';
const SUBMISSION_A_ONE = '5c000000-0000-4000-8000-000000000401';
const SUBMISSION_B_ONE = '5c000000-0000-4000-8000-000000000402';
const SUBMISSION_A_TWO = '5c000000-0000-4000-8000-000000000403';
const CLOSED_SUBMISSION = '5c000000-0000-4000-8000-000000000404';
const NOW = new Date('2026-09-24T04:00:00.000Z');

describe('PostgresCollectionOverviewRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresCollectionOverviewRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id)
        values (${ACTOR_PERSON}), (${STUDENT_A_PERSON}), (${STUDENT_B_PERSON}), (${STUDENT_C_PERSON})
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state, created_at, updated_at)
        values
          (${ACTOR_ACCOUNT}, ${ACTOR_PERSON}, ${ACTOR_PERSON}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_A_ACCOUNT}, ${STUDENT_A_PERSON}, ${STUDENT_A_PERSON}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_B_ACCOUNT}, ${STUDENT_B_PERSON}, ${STUDENT_B_PERSON}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_C_ACCOUNT}, ${STUDENT_C_PERSON}, ${STUDENT_C_PERSON}, 'set', ${NOW}, ${NOW})
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th, created_at, updated_at)
        values
          (${ACTOR_PERSON}, 'ผู้สอน', 'ทดสอบ', ${NOW}, ${NOW}),
          (${STUDENT_A_PERSON}, 'นักศึกษาเอ', 'นามสกุลเอ', ${NOW}, ${NOW}),
          (${STUDENT_B_PERSON}, 'นักศึกษาบี', 'นามสกุลบี', ${NOW}, ${NOW}),
          (${STUDENT_C_PERSON}, 'นักศึกษาซี', 'นามสกุลซี', ${NOW}, ${NOW})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year, created_at)
        values
          (${STUDENT_A_PERSON}, 2566, 2573, ${NOW}),
          (${STUDENT_B_PERSON}, 2566, 2573, ${NOW}),
          (${STUDENT_C_PERSON}, 2567, 2574, ${NOW})
      `;
      await transaction`
        insert into public.collection_rounds (id, name, status, created_by_account_id, created_at)
        values
          (${ACTIVE_ROUND}, 'รอบที่เปิด', 'active', ${ACTOR_ACCOUNT}, ${NOW}),
          (${CLOSED_ROUND}, 'รอบที่ปิด', 'closed', ${ACTOR_ACCOUNT}, ${NOW})
      `;
      await transaction`
        insert into public.collection_groups (id, round_id, name, created_by_account_id, created_at)
        values
          (${GROUP_ONE}, ${ACTIVE_ROUND}, 'กลุ่มหนึ่ง', ${ACTOR_ACCOUNT}, ${NOW}),
          (${GROUP_TWO}, ${ACTIVE_ROUND}, 'กลุ่มสอง', ${ACTOR_ACCOUNT}, ${NOW}),
          (${CLOSED_GROUP}, ${CLOSED_ROUND}, 'กลุ่มปิด', ${ACTOR_ACCOUNT}, ${NOW})
      `;
      await transaction`
        insert into public.collection_group_memberships
          (group_id, student_account_id, membership_source, added_by_account_id, added_at)
        values
          (${GROUP_ONE}, ${STUDENT_A_ACCOUNT}, 'individual', ${ACTOR_ACCOUNT}, ${NOW}),
          (${GROUP_ONE}, ${STUDENT_B_ACCOUNT}, 'individual', ${ACTOR_ACCOUNT}, ${NOW}),
          (${GROUP_ONE}, ${STUDENT_C_ACCOUNT}, 'individual', ${ACTOR_ACCOUNT}, ${NOW}),
          (${GROUP_TWO}, ${STUDENT_A_ACCOUNT}, 'individual', ${ACTOR_ACCOUNT}, ${NOW}),
          (${CLOSED_GROUP}, ${STUDENT_C_ACCOUNT}, 'individual', ${ACTOR_ACCOUNT}, ${NOW})
      `;
      await transaction`
        insert into public.collection_forms
          (id, group_id, title, status, fields, deadline_at, created_by_account_id, created_at, opened_at)
        values
          (${FORM_ONE}, ${GROUP_ONE}, 'แบบฟอร์มหนึ่ง', 'open', '[]'::jsonb,
            ${new Date('2026-09-25T04:00:00.000Z')}, ${ACTOR_ACCOUNT}, ${NOW}, ${NOW}),
          (${FORM_TWO}, ${GROUP_TWO}, 'แบบฟอร์มสอง', 'open', '[]'::jsonb,
            ${new Date('2026-09-26T04:00:00.000Z')}, ${ACTOR_ACCOUNT}, ${NOW}, ${NOW}),
          (${CLOSED_FORM}, ${CLOSED_GROUP}, 'แบบฟอร์มในรอบปิด', 'open', '[]'::jsonb,
            null, ${ACTOR_ACCOUNT}, ${NOW}, ${NOW})
      `;
      await transaction`
        insert into public.collection_obligations
          (form_id, student_account_id, assigned_at)
        values
          (${FORM_ONE}, ${STUDENT_A_ACCOUNT}, ${NOW}),
          (${FORM_ONE}, ${STUDENT_B_ACCOUNT}, ${NOW}),
          (${FORM_ONE}, ${STUDENT_C_ACCOUNT}, ${NOW}),
          (${FORM_TWO}, ${STUDENT_A_ACCOUNT}, ${NOW}),
          (${CLOSED_FORM}, ${STUDENT_C_ACCOUNT}, ${NOW})
      `;
      await transaction`
        insert into private.collection_submissions
          (id, form_id, student_account_id, idempotency_key, version, answers, submitted_at)
        values
          (${SUBMISSION_A_ONE}, ${FORM_ONE}, ${STUDENT_A_ACCOUNT},
            ${'5c000000-0000-4000-8000-000000000501'}, 1, '{}'::jsonb, ${NOW}),
          (${SUBMISSION_B_ONE}, ${FORM_ONE}, ${STUDENT_B_ACCOUNT},
            ${'5c000000-0000-4000-8000-000000000502'}, 1, '{}'::jsonb, ${NOW}),
          (${SUBMISSION_A_TWO}, ${FORM_TWO}, ${STUDENT_A_ACCOUNT},
            ${'5c000000-0000-4000-8000-000000000503'}, 1, '{}'::jsonb, ${NOW}),
          (${CLOSED_SUBMISSION}, ${CLOSED_FORM}, ${STUDENT_C_ACCOUNT},
            ${'5c000000-0000-4000-8000-000000000504'}, 1, '{}'::jsonb, ${NOW})
      `;
      await transaction`
        update public.collection_obligations
        set status = 'awaiting_checking', first_submitted_at = ${NOW},
          latest_submission_id = case
            when form_id = ${FORM_ONE} and student_account_id = ${STUDENT_A_ACCOUNT}
              then ${SUBMISSION_A_ONE}::uuid
            when form_id = ${FORM_ONE} and student_account_id = ${STUDENT_B_ACCOUNT}
              then ${SUBMISSION_B_ONE}::uuid
            when form_id = ${FORM_TWO} and student_account_id = ${STUDENT_A_ACCOUNT}
              then ${SUBMISSION_A_TWO}::uuid
            when form_id = ${CLOSED_FORM} and student_account_id = ${STUDENT_C_ACCOUNT}
              then ${CLOSED_SUBMISSION}::uuid
          end
        where (form_id, student_account_id) in (
          (${FORM_ONE}, ${STUDENT_A_ACCOUNT}),
          (${FORM_ONE}, ${STUDENT_B_ACCOUNT}),
          (${FORM_TWO}, ${STUDENT_A_ACCOUNT}),
          (${CLOSED_FORM}, ${STUDENT_C_ACCOUNT})
        )
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  /*
   * Fixture state, so the expectations below are readable:
   * - Student A: FORM_ONE awaiting_checking, FORM_TWO awaiting_checking -> partial.
   * - Student B: FORM_ONE awaiting_checking -> partial.
   * - Student C: no active-round obligation submitted -> no submission.
   * CLOSED_FORM belongs to a closed round and must never be counted.
   */
  it('aggregates active rounds without N+1 reads and bounds the attention list', async () => {
    const result = await repository.getOverview({
      attentionLimit: 1,
      progressLimit: 12,
      scope: { entryYear: null, groupId: GROUP_ONE, roundId: ACTIVE_ROUND },
      upcomingLimit: 3,
    });

    expect(result.activeRoundTotals).toEqual({
      groups: 1,
      students: 3,
      studentsFullyComplete: 0,
      studentsPartiallyComplete: 2,
      studentsWithNoSubmission: 1,
      studentsWithObligations: 3,
      submissionsPendingReview: 2,
    });
    expect(result.needsAttention).toEqual([
      {
        deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
        formId: FORM_ONE,
        formTitle: 'แบบฟอร์มหนึ่ง',
        groupId: GROUP_ONE,
        groupName: 'กลุ่มหนึ่ง',
        roundId: ACTIVE_ROUND,
        roundName: 'รอบที่เปิด',
        studentsNotSubmitted: 1,
        submissionsPendingReview: 2,
      },
    ]);
    expect(result.activeFormProgress).toEqual([
      {
        completedStudents: 0,
        deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
        formId: FORM_ONE,
        formTitle: 'แบบฟอร์มหนึ่ง',
        groupId: GROUP_ONE,
        groupName: 'กลุ่มหนึ่ง',
        roundId: ACTIVE_ROUND,
        roundName: 'รอบที่เปิด',
        totalStudents: 3,
      },
    ]);
  });

  it('never counts a closed round in the active-round totals', async () => {
    const result = await repository.getOverview({
      attentionLimit: 5,
      progressLimit: 12,
      scope: { entryYear: null, groupId: CLOSED_GROUP, roundId: CLOSED_ROUND },
      upcomingLimit: 3,
    });

    // Scoping explicitly to the closed round is the only way to see it at all;
    // the unscoped read above never includes it.
    expect(result.activeRoundTotals.groups).toBe(1);
    const unscopedToClosed = await repository.getOverview({
      attentionLimit: 5,
      progressLimit: 12,
      scope: { entryYear: null, groupId: CLOSED_GROUP, roundId: null },
      upcomingLimit: 3,
    });
    expect(unscopedToClosed.activeRoundTotals.groups).toBe(0);
    expect(unscopedToClosed.activeRoundTotals.students).toBe(0);
  });

  /*
   * The Student buckets must partition the population that owes something, so
   * the donut the dashboard draws cannot double-count or lose a Student.
   */
  it('partitions Students into mutually exclusive completion buckets', async () => {
    const { activeRoundTotals } = await repository.getOverview({
      attentionLimit: 5,
      progressLimit: 6,
      scope: { entryYear: null, groupId: null, roundId: ACTIVE_ROUND },
      upcomingLimit: 3,
    });

    expect(
      activeRoundTotals.studentsFullyComplete +
        activeRoundTotals.studentsPartiallyComplete +
        activeRoundTotals.studentsWithNoSubmission,
    ).toBe(activeRoundTotals.studentsWithObligations);
    expect(activeRoundTotals.studentsWithObligations).toBeLessThanOrEqual(
      activeRoundTotals.students,
    );
  });

  it('counts a Student whose every active-round obligation passed as fully complete', async () => {
    await database.sql`
      update public.collection_obligations set status = 'passed'
      where student_account_id = ${STUDENT_A_ACCOUNT}
        and form_id in (${FORM_ONE}, ${FORM_TWO})
    `;

    try {
      const { activeRoundTotals } = await repository.getOverview({
        attentionLimit: 5,
        progressLimit: 6,
        scope: { entryYear: null, groupId: null, roundId: ACTIVE_ROUND },
        upcomingLimit: 3,
      });

      expect(activeRoundTotals.studentsFullyComplete).toBe(1);
      expect(activeRoundTotals.studentsPartiallyComplete).toBe(1);
      expect(activeRoundTotals.studentsWithNoSubmission).toBe(1);
    } finally {
      await database.sql`
        update public.collection_obligations set status = 'awaiting_checking'
        where student_account_id = ${STUDENT_A_ACCOUNT}
          and form_id in (${FORM_ONE}, ${FORM_TWO})
      `;
    }
  });

  it('scopes the totals to one Entry Year without dropping the forms', async () => {
    const { activeRoundTotals } = await repository.getOverview({
      attentionLimit: 5,
      progressLimit: 6,
      scope: { entryYear: 2567, groupId: null, roundId: ACTIVE_ROUND },
      upcomingLimit: 3,
    });

    // Only Student C is in cohort 2567, and they have submitted nothing.
    expect(activeRoundTotals.students).toBe(1);
    expect(activeRoundTotals.studentsWithNoSubmission).toBe(1);
    expect(activeRoundTotals.studentsPartiallyComplete).toBe(0);
  });

  it('scopes the totals to one group', async () => {
    const { activeRoundTotals } = await repository.getOverview({
      attentionLimit: 5,
      progressLimit: 6,
      scope: { entryYear: null, groupId: GROUP_TWO, roundId: null },
      upcomingLimit: 3,
    });

    expect(activeRoundTotals.groups).toBe(1);
    expect(activeRoundTotals.students).toBe(1);
  });

  it('lists only future deadlines, soonest first', async () => {
    const future = new Date(Date.now() + 86_400_000);
    await database.sql`
      update public.collection_forms set deadline_at = ${future} where id = ${FORM_ONE}
    `;

    try {
      const { upcomingDeadlines } = await repository.getOverview({
        attentionLimit: 5,
        progressLimit: 6,
        scope: { entryYear: null, groupId: GROUP_ONE, roundId: ACTIVE_ROUND },
        upcomingLimit: 3,
      });

      expect(upcomingDeadlines).toHaveLength(1);
      expect(upcomingDeadlines[0]?.formId).toBe(FORM_ONE);
      expect(upcomingDeadlines[0]?.deadlineAt.getTime()).toBeGreaterThan(Date.now());
      expect(upcomingDeadlines[0]?.studentsNotSubmitted).toBe(3);
    } finally {
      await database.sql`
        update public.collection_forms
        set deadline_at = ${new Date('2026-09-25T04:00:00.000Z')}
        where id = ${FORM_ONE}
      `;
    }
  });

  it('omits a form whose deadline has already passed', async () => {
    const past = new Date(Date.now() - 86_400_000);
    await database.sql`
      update public.collection_forms set deadline_at = ${past} where id = ${FORM_ONE}
    `;

    try {
      const { upcomingDeadlines } = await repository.getOverview({
        attentionLimit: 5,
        progressLimit: 6,
        scope: { entryYear: null, groupId: GROUP_ONE, roundId: ACTIVE_ROUND },
        upcomingLimit: 3,
      });

      expect(upcomingDeadlines).toEqual([]);
    } finally {
      await database.sql`
        update public.collection_forms
        set deadline_at = ${new Date('2026-09-25T04:00:00.000Z')}
        where id = ${FORM_ONE}
      `;
    }
  });

  it('pages outstanding Students by an opaque cursor that carries no Student ID', async () => {
    const first = await repository.getStudentAttention({
      cursor: null,
      limit: 2,
      scope: { entryYear: null, groupId: null, roundId: ACTIVE_ROUND },
    });

    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    expect(first.rows[0]).toMatchObject({
      formId: FORM_ONE,
      roundId: ACTIVE_ROUND,
      roundName: 'รอบที่เปิด',
    });
    for (const row of first.rows) {
      expect(row.status).not.toBe('passed');
      expect(Object.keys(row)).not.toContain('studentId');
    }

    const second = await repository.getStudentAttention({
      cursor: decodeAttentionCursor(first.nextCursor ?? ''),
      limit: 2,
      scope: { entryYear: null, groupId: null, roundId: ACTIVE_ROUND },
    });

    const firstKeys = first.rows.map((row) => `${row.formId}:${row.studentAccountId}`);
    for (const row of second.rows) {
      expect(firstKeys).not.toContain(`${row.formId}:${row.studentAccountId}`);
    }
  });

  it('returns bounded dropdown sources including the active Entry Years', async () => {
    const filters = await repository.getFilterOptions({ groupLimit: 200, roundLimit: 50 });

    expect(filters.rounds.map((round) => round.id)).toEqual(
      expect.arrayContaining([ACTIVE_ROUND, CLOSED_ROUND]),
    );
    expect(filters.groups.map((group) => group.id)).toEqual(
      expect.arrayContaining([GROUP_ONE, GROUP_TWO]),
    );
    expect(filters.entryYears).toEqual(expect.arrayContaining([2566, 2567]));
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        update public.collection_obligations
        set latest_submission_id = null
        where form_id in (${FORM_ONE}, ${FORM_TWO}, ${CLOSED_FORM})
      `;
      await transaction`
        delete from private.collection_submissions
        where id in (${SUBMISSION_A_ONE}, ${SUBMISSION_B_ONE}, ${SUBMISSION_A_TWO}, ${CLOSED_SUBMISSION})
      `;
      await transaction`
        delete from public.collection_obligations
        where form_id in (${FORM_ONE}, ${FORM_TWO}, ${CLOSED_FORM})
      `;
      await transaction`
        delete from public.collection_forms
        where id in (${FORM_ONE}, ${FORM_TWO}, ${CLOSED_FORM})
      `;
      await transaction`
        delete from public.collection_group_memberships
        where group_id in (${GROUP_ONE}, ${GROUP_TWO}, ${CLOSED_GROUP})
      `;
      await transaction`
        delete from public.collection_groups
        where id in (${GROUP_ONE}, ${GROUP_TWO}, ${CLOSED_GROUP})
      `;
      await transaction`
        delete from public.collection_rounds where id in (${ACTIVE_ROUND}, ${CLOSED_ROUND})
      `;
      await transaction`
        delete from public.accounts
        where id in (${ACTOR_ACCOUNT}, ${STUDENT_A_ACCOUNT}, ${STUDENT_B_ACCOUNT}, ${STUDENT_C_ACCOUNT})
      `;
      await transaction`
        delete from public.students
        where person_id in (${STUDENT_A_PERSON}, ${STUDENT_B_PERSON}, ${STUDENT_C_PERSON})
      `;
      await transaction`
        delete from private.person_names
        where person_id in (${ACTOR_PERSON}, ${STUDENT_A_PERSON}, ${STUDENT_B_PERSON}, ${STUDENT_C_PERSON})
      `;
      await transaction`
        delete from public.people
        where id in (${ACTOR_PERSON}, ${STUDENT_A_PERSON}, ${STUDENT_B_PERSON}, ${STUDENT_C_PERSON})
      `;
    });
  }
});
