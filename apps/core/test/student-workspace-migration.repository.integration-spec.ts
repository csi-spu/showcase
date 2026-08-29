import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresWorkContributorsRepository } from '../src/modules/works/infrastructure/postgres-work-contributors.repository';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const NOW = new Date('2026-08-28T13:00:00.000Z');
const SUBMITTER_PERSON_ID = '56000000-0000-4000-8000-000000000001';
const ACCEPTED_PERSON_ID = '56000000-0000-4000-8000-000000000002';
const PENDING_PERSON_ID = '56000000-0000-4000-8000-000000000003';
const TERMINAL_PERSON_ID = '56000000-0000-4000-8000-000000000004';
const WORK_ID = '56000000-0000-4000-8000-000000000005';
const WORK_PUBLIC_ID = '56000000-0000-4000-8000-000000000006';
const ACCEPTED_INVITATION_ID = '56000000-0000-4000-8000-000000000007';
const PENDING_INVITATION_ID = '56000000-0000-4000-8000-000000000008';
const TERMINAL_INVITATION_ID = '56000000-0000-4000-8000-000000000009';
const REVISION_ID = '56000000-0000-4000-8000-000000000010';
const ACCEPTED_ACCOUNT_ID = '56000000-0000-4000-8000-000000000011';
const PENDING_ACCOUNT_ID = '56000000-0000-4000-8000-000000000012';
const ACCEPTED_PROVIDER_ID = '56000000-0000-4000-8000-000000000013';
const PENDING_PROVIDER_ID = '56000000-0000-4000-8000-000000000014';
const EXTERNAL_INVITATION_ID = '56000000-0000-4000-8000-000000000015';
const EXTERNAL_PERSON_ID = '56000000-0000-4000-8000-000000000016';
const EXTERNAL_SESSION_HASH = 'f'.repeat(64);
const REVOKED_INVITATION_ID = '56000000-0000-4000-8000-000000000017';
const EXPIRED_INVITATION_ID = '56000000-0000-4000-8000-000000000018';
const WITHDRAWN_INVITATION_ID = '56000000-0000-4000-8000-000000000019';
const RACING_INVITATION_ID = '56000000-0000-4000-8000-000000000020';
const SUBMITTER_ACCOUNT_ID = '56000000-0000-4000-8000-000000000021';
const TERMINAL_ACCOUNT_ID = '56000000-0000-4000-8000-000000000022';
const SUBMITTER_PROVIDER_ID = '56000000-0000-4000-8000-000000000023';
const TERMINAL_PROVIDER_ID = '56000000-0000-4000-8000-000000000024';
const TERMINAL_PROFILE_PUBLIC_ID = '56000000-0000-4000-8000-000000000025';

describe('issue #56 Phase A migration integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const contributors = new PostgresWorkContributorsRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (sql) => {
      await sql`set local session_replication_role = replica`;
      await sql`
        insert into public.people (id, created_at) values
          (${SUBMITTER_PERSON_ID}, ${NOW}),
          (${ACCEPTED_PERSON_ID}, ${NOW}),
          (${PENDING_PERSON_ID}, ${NOW}),
          (${TERMINAL_PERSON_ID}, ${NOW}),
          (${EXTERNAL_PERSON_ID}, ${NOW})
      `;
      await sql`
        insert into private.person_names (person_id, first_name_th, last_name_th) values
          (${ACCEPTED_PERSON_ID}, 'คน', 'ยอมรับ'),
          (${PENDING_PERSON_ID}, 'คน', 'รอดำเนินการ'),
          (${TERMINAL_PERSON_ID}, 'คน', 'ปฏิเสธ')
      `;
      await sql`
        insert into public.students (person_id, entry_year, access_ends_academic_year) values
          (${SUBMITTER_PERSON_ID}, 2566, 2573), (${ACCEPTED_PERSON_ID}, 2566, 2573),
          (${PENDING_PERSON_ID}, 2566, 2573), (${TERMINAL_PERSON_ID}, 2566, 2573)
      `;
      await sql`
        insert into public.public_profiles
        select profile.*
        from jsonb_populate_record(
          null::public.public_profiles,
          jsonb_build_object(
            'person_id', ${TERMINAL_PERSON_ID},
            'public_id', ${TERMINAL_PROFILE_PUBLIC_ID},
            'display_name', 'คน ปฏิเสธ',
            'bio', null,
            'photo_id', null,
            'version', 1,
            'created_at', ${NOW},
            'updated_at', ${NOW}
          )
        ) as profile
      `;
      await sql`
        insert into public.profile_consents (
          person_id, consent_text_version, granted_at
        ) values (${TERMINAL_PERSON_ID}, 'phase-1', ${NOW})
      `;
      await sql`
        insert into public.accounts (id, person_id, provider_user_id, credential_state) values
          (${SUBMITTER_ACCOUNT_ID}, ${SUBMITTER_PERSON_ID}, ${SUBMITTER_PROVIDER_ID}, 'set'),
          (${ACCEPTED_ACCOUNT_ID}, ${ACCEPTED_PERSON_ID}, ${ACCEPTED_PROVIDER_ID}, 'set'),
          (${PENDING_ACCOUNT_ID}, ${PENDING_PERSON_ID}, ${PENDING_PROVIDER_ID}, 'set'),
          (${TERMINAL_ACCOUNT_ID}, ${TERMINAL_PERSON_ID}, ${TERMINAL_PROVIDER_ID}, 'set')
      `;
      await sql`
        insert into public.account_roles (account_id, role) values
          (${SUBMITTER_ACCOUNT_ID}, 'student'), (${ACCEPTED_ACCOUNT_ID}, 'student'),
          (${PENDING_ACCOUNT_ID}, 'student'), (${TERMINAL_ACCOUNT_ID}, 'student')
      `;
      await sql`
        insert into public.works (
          id, public_id, submitter_person_id, activity_state, publication_state,
          created_at, updated_at
        ) values (
          ${WORK_ID}, ${WORK_PUBLIC_ID}, ${SUBMITTER_PERSON_ID}, 'active',
          'never_published', ${NOW}, ${NOW}
        )
      `;
      await sql`
        insert into private.work_drafts (
          work_id, title, summary, description, category, academic_year, semester,
          version, created_at, updated_at
        ) values (${WORK_ID}, null, null, null, null, null, null, 1, ${NOW}, ${NOW})
      `;
      await sql`
        insert into private.attribution_invitations (
          id, work_id, kind, invitee_person_id, accepted_person_id, state,
          attribution_name, study_year, public_attribution_consented_at,
          invitation_token_hash, proposed_attribution_name, proposed_contribution_role,
          expires_at, created_at, updated_at, resolved_at
        ) values
          (
            ${ACCEPTED_INVITATION_ID}, ${WORK_ID}, 'account', ${ACCEPTED_PERSON_ID},
            ${ACCEPTED_PERSON_ID}, 'accepted', 'คน ยอมรับ', 2, ${NOW}, null, null, null,
            ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}, ${NOW}, ${NOW}
          ),
          (
            ${PENDING_INVITATION_ID}, ${WORK_ID}, 'account', ${PENDING_PERSON_ID},
            null, 'pending', null, null, null, null, null, null,
            ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}, ${NOW}, null
          ),
          (
            ${TERMINAL_INVITATION_ID}, ${WORK_ID}, 'account', ${TERMINAL_PERSON_ID},
            null, 'rejected', null, null, null, null, null, null,
            ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}, ${NOW}, ${NOW}
          ),
          (
            ${REVOKED_INVITATION_ID}, ${WORK_ID}, 'account', ${TERMINAL_PERSON_ID},
            null, 'revoked', null, null, null, null, null, null,
            ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}, ${NOW}, ${NOW}
          ),
          (
            ${EXPIRED_INVITATION_ID}, ${WORK_ID}, 'account', ${TERMINAL_PERSON_ID},
            null, 'expired', null, null, null, null, null, null,
            ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}, ${NOW}, ${NOW}
          ),
          (
            ${WITHDRAWN_INVITATION_ID}, ${WORK_ID}, 'account', ${TERMINAL_PERSON_ID},
            ${TERMINAL_PERSON_ID}, 'withdrawn', 'คน ถอนตัว', 3, ${NOW}, null, null, null,
            ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}, ${NOW}, ${NOW}
          ),
          (
            ${EXTERNAL_INVITATION_ID}, ${WORK_ID}, 'external', ${EXTERNAL_PERSON_ID},
            null, 'pending', null, null, null, ${'a'.repeat(64)},
            'บุคคล ภายนอก', 'ออกแบบ',
            ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}, ${NOW}, null
          )
      `;
      await sql`
        insert into private.attribution_invitation_sessions (
          session_hash, invitation_id, expires_at, created_at
        ) values (
          ${EXTERNAL_SESSION_HASH}, ${EXTERNAL_INVITATION_ID},
          ${new Date('2026-09-11T13:00:00.000Z')}, ${NOW}
        )
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('stores an incomplete private Draft while retaining populated-value constraints', async () => {
    const rows = await database.sql<
      Array<{
        academic_year: number | null;
        category: string | null;
        description: string | null;
        semester: string | null;
        summary: string | null;
        title: string | null;
      }>
    >`
      select title, summary, description, category, academic_year, semester
      from private.work_drafts where work_id = ${WORK_ID}
    `;
    expect(rows).toEqual([
      {
        academic_year: null,
        category: null,
        description: null,
        semester: null,
        summary: null,
        title: null,
      },
    ]);
    await expect(
      database.sql`update private.work_drafts set title = '  ไม่ปกติ  ' where work_id = ${WORK_ID}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('uses partial indexes for bounded Contributor name search', async () => {
    const plan = await database.sql.begin(async (sql) => {
      await sql`set local enable_seqscan = off`;
      const fuzzy = await sql<Array<{ 'QUERY PLAN': unknown }>>`
        explain (format json)
        select person_id
        from private.person_names
        where first_name_th is not null and last_name_th is not null
          and (
            lower(first_name_th || ' ' || last_name_th) like '%สมชาย%' escape '\\'
            or lower(first_name_th || ' ' || last_name_th) operator(extensions.%) 'สมชาย'
          )
        limit 8
      `;
      const prefix = await sql<Array<{ 'QUERY PLAN': unknown }>>`
        explain (format json)
        select person_id
        from private.person_names
        where first_name_th is not null and last_name_th is not null
          and lower(first_name_th) like 'สม%' escape '\\'
        limit 8
      `;
      return { fuzzy, prefix };
    });
    expect(JSON.stringify(plan)).toContain('person_names_contributor_search_trgm_idx');
    expect(JSON.stringify(plan)).toContain('person_names_contributor_first_name_prefix_idx');
  });

  it('refuses cutover while a legacy source row has no durable backfill outcome', async () => {
    await expect(
      database.sql`select * from private.execute_issue_56_contributor_cutover()`,
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('keeps direct Contributor runtime disabled before the atomic cutover', async () => {
    await expect(
      contributors.searchCandidates({
        actorAccountId: ACCEPTED_ACCOUNT_ID,
        nameQuery: null,
        now: NOW,
        sourceKeyHash: '1'.repeat(64),
        studentIdHash: '2'.repeat(64),
        workPublicId: WORK_PUBLIC_ID,
      }),
    ).resolves.toEqual({ outcome: 'cutover_unavailable' });
  });

  it('backfills accepted and pending legacy invitations in bounded resumable batches', async () => {
    const batches: Array<{
      inserted_count: number;
      remaining_count: number;
      terminal_excluded_count: number;
    }> = [];
    do {
      const rows = await database.sql<typeof batches>`
        select * from private.backfill_work_draft_contributors(1)
      `;
      batches.push(rows[0]!);
    } while (batches.at(-1)?.remaining_count !== 0);
    expect(batches).toHaveLength(7);
    expect(batches.reduce((count, batch) => count + batch.inserted_count, 0)).toBe(3);
    expect(batches.reduce((count, batch) => count + batch.terminal_excluded_count, 0)).toBe(4);

    const contributors = await database.sql<
      Array<{
        attribution_name: string;
        contribution_role: string | null;
        legacy_invitation_id: string;
      }>
    >`
      select attribution_name, contribution_role, legacy_invitation_id
      from private.work_draft_contributors
      where work_id = ${WORK_ID}
      order by position
    `;
    expect(contributors).toEqual([
      {
        attribution_name: 'คน ยอมรับ',
        contribution_role: null,
        legacy_invitation_id: ACCEPTED_INVITATION_ID,
      },
      {
        attribution_name: 'คน รอดำเนินการ',
        contribution_role: null,
        legacy_invitation_id: PENDING_INVITATION_ID,
      },
      {
        attribution_name: 'บุคคล ภายนอก',
        contribution_role: 'ออกแบบ',
        legacy_invitation_id: EXTERNAL_INVITATION_ID,
      },
    ]);

    const replay = await database.sql<
      Array<{ inserted_count: number; retained_count: number }>
    >`select * from private.backfill_work_draft_contributors(1)`;
    expect(replay[0]).toMatchObject({ inserted_count: 0, retained_count: 0 });
  });

  it('refuses cutover while a backfill failure still requires remediation', async () => {
    await database.sql`
      update private.work_draft_contributor_backfill_items
      set outcome = 'invalid_source'
      where invitation_id = ${ACCEPTED_INVITATION_ID}
    `;
    try {
      await expect(
        database.sql`select * from private.execute_issue_56_contributor_cutover()`,
      ).rejects.toMatchObject({ code: '55000' });
    } finally {
      await database.sql`
        update private.work_draft_contributor_backfill_items
        set outcome = 'inserted'
        where invitation_id = ${ACCEPTED_INVITATION_ID}
      `;
    }
  });

  it('rechecks completeness after a concurrent legacy invitation writer commits', async () => {
    let releaseWriter: () => void = () => {};
    let reportInserted: () => void = () => {};
    const writerRelease = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const invitationInserted = new Promise<void>((resolve) => {
      reportInserted = resolve;
    });
    const writer = database.sql.begin(async (sql) => {
      await sql`
        insert into private.attribution_invitations (
          id, work_id, kind, invitee_person_id, state, expires_at, created_at, updated_at
        ) values (
          ${RACING_INVITATION_ID}, ${WORK_ID}, 'account', ${TERMINAL_PERSON_ID}, 'pending',
          ${new Date('2026-09-11T13:00:00.000Z')}, ${new Date(NOW.getTime() + 1)},
          ${new Date(NOW.getTime() + 1)}
        )
      `;
      reportInserted();
      await writerRelease;
    });
    await invitationInserted;

    let reportCutoverPid: (pid: number) => void = () => {};
    const cutoverPid = new Promise<number>((resolve) => {
      reportCutoverPid = resolve;
    });
    const cutover = database.sql
      .begin(async (sql) => {
        const rows = await sql<Array<{ pid: number }>>`select pg_backend_pid() as pid`;
        reportCutoverPid(rows[0]!.pid);
        return sql`select * from private.execute_issue_56_contributor_cutover()`;
      })
      .then(
        (value) => ({ error: null, value }),
        (error: unknown) => ({ error, value: null }),
      );
    const pid = await cutoverPid;
    let isWaitingForLock = false;
    for (let attempt = 0; attempt < 50 && !isWaitingForLock; attempt += 1) {
      const activity = await database.sql<Array<{ wait_event_type: string | null }>>`
        select wait_event_type from pg_stat_activity where pid = ${pid}
      `;
      isWaitingForLock = activity[0]?.wait_event_type === 'Lock';
      if (!isWaitingForLock) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    try {
      expect(isWaitingForLock).toBe(true);
    } finally {
      releaseWriter();
      await writer;
    }
    const cutoverResult = await cutover;
    expect(cutoverResult.value).toBeNull();
    expect(cutoverResult.error).toMatchObject({ code: '55000' });
    await database.sql`
      delete from private.attribution_invitations where id = ${RACING_INVITATION_ID}
    `;
  });

  it('creates an opaque Contributor Candidate reference for a name match after cutover', async () => {
    const result = await database.sql.begin(async (sql) => {
      await sql`savepoint contributor_candidate_search`;
      try {
        await sql`select * from private.execute_issue_56_contributor_cutover()`;
        const transactionRepository = new PostgresWorkContributorsRepository({
          sql: {
            begin: <T>(callback: (transaction: typeof sql) => Promise<T>) => callback(sql),
          },
        } as unknown as DatabaseClient);
        return await transactionRepository.searchCandidates({
          actorAccountId: SUBMITTER_ACCOUNT_ID,
          nameQuery: 'คน ปฏิเสธ',
          now: NOW,
          sourceKeyHash: '3'.repeat(64),
          studentIdHash: null,
          workPublicId: WORK_PUBLIC_ID,
        });
      } finally {
        await sql`rollback to savepoint contributor_candidate_search`;
      }
    });

    expect(result).toMatchObject({
      candidates: [
        {
          firstName: 'คน',
          lastName: 'ปฏิเสธ',
          publicProfile: {
            entryYear: 2566,
            hasPhoto: false,
            publicId: TERMINAL_PROFILE_PUBLIC_ID,
          },
        },
      ],
      outcome: 'matches',
    });
    if (result.outcome !== 'matches') throw new Error('EXPECTED_CONTRIBUTOR_CANDIDATE_MATCH');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.candidateReference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(JSON.stringify(result)).not.toMatch(/accountId|personId|studentId/i);
  });

  it('keeps historical Study Year 8 while enforcing the new attribution model', async () => {
    await database.sql`
      insert into private.work_revisions (
        id, work_id, revision_number, status, draft_version, title, summary,
        description, category, academic_year, semester, submitted_at
      ) values (
        ${REVISION_ID}, ${WORK_ID}, 1, 'pending_review', 1, 'ชื่อผลงาน', 'สรุป',
        'รายละเอียด', 'course_work', 2569, '1', ${NOW}
      )
    `;
    await database.sql`
      insert into private.work_revision_attributions (
        revision_id, position, kind, person_id, attribution_name, study_year,
        attribution_model_version
      ) values (
        ${REVISION_ID}, 1, 'submitter', ${SUBMITTER_PERSON_ID}, 'ผู้ส่งเดิม', 8, 1
      )
    `;
    await expect(
      database.sql`
        insert into private.work_revision_attributions (
          revision_id, position, kind, person_id, attribution_name, study_year,
          attribution_model_version
        ) values (
          ${REVISION_ID}, 2, 'submitter', ${ACCEPTED_PERSON_ID}, 'ผู้ส่งใหม่', 5, 2
        )
      `,
    ).rejects.toMatchObject({ code: '23514' });
    const historical = await database.sql<Array<{ study_year: number }>>`
      select study_year from private.work_revision_attributions
      where revision_id = ${REVISION_ID} and position = 1
    `;
    expect(historical).toEqual([{ study_year: 8 }]);
  });

  it('denies direct anon access to every new private table', async () => {
    for (const table of [
      'work_draft_contributors',
      'work_saved_draft_operations',
      'work_contributor_candidates',
      'work_draft_contributor_operations',
      'work_draft_contributor_backfill_runs',
      'work_draft_contributor_backfill_items',
      'attribution_removal_rate_limits',
      'issue_56_contributor_cutover_state',
    ]) {
      await expect(
        database.sql.begin(async (sql) => {
          await sql`set local role anon`;
          await sql.unsafe(`select * from private.${table} limit 1`);
        }),
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('cuts over only after backfill, invalidates secrets, and remains replay-safe', async () => {
    let remaining = 1;
    while (remaining > 0) {
      const batch = await database.sql<Array<{ remaining_count: number }>>`
        select * from private.backfill_work_draft_contributors(500)
      `;
      remaining = batch[0]!.remaining_count;
    }
    const retained = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.attribution_invitations
      where id in (
        ${ACCEPTED_INVITATION_ID}, ${PENDING_INVITATION_ID}, ${TERMINAL_INVITATION_ID},
        ${REVOKED_INVITATION_ID}, ${EXPIRED_INVITATION_ID}, ${WITHDRAWN_INVITATION_ID},
        ${EXTERNAL_INVITATION_ID}
      )
    `;
    expect(retained).toEqual([{ count: 7 }]);
    await expect(
      database.sql.begin(async (sql) => {
        const first = await sql<
          Array<{ deleted_session_count: number; invalidated_invitation_count: number }>
        >`select * from private.execute_issue_56_contributor_cutover()`;
        expect(first[0]).toMatchObject({
          deleted_session_count: 1,
          invalidated_invitation_count: 1,
        });
        const replay = await sql<
          Array<{ deleted_session_count: number; invalidated_invitation_count: number }>
        >`select * from private.execute_issue_56_contributor_cutover()`;
        expect(replay).toEqual(first);
        const secrets = await sql<Array<{ invitation_count: number; session_count: number }>>`
          select
            (select count(*)::integer from private.attribution_invitations
              where invitation_token_hash is not null or recovery_code_hash is not null)
              as invitation_count,
            (select count(*)::integer from private.attribution_invitation_sessions)
              as session_count
        `;
        expect(secrets).toEqual([{ invitation_count: 0, session_count: 0 }]);
        await sql`
          update private.attribution_invitations
          set updated_at = ${new Date(NOW.getTime() + 1_000)}
          where id = ${PENDING_INVITATION_ID}
        `;
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (sql) => {
      await sql`set local session_replication_role = replica`;
      await sql`
        delete from private.work_revision_attributions
        where revision_id in (select id from private.work_revisions where work_id = ${WORK_ID})
      `;
      await sql`delete from private.work_revisions where work_id = ${WORK_ID}`;
      await sql`
        delete from private.work_draft_contributors
        where legacy_invitation_id in (
          ${ACCEPTED_INVITATION_ID}, ${PENDING_INVITATION_ID}, ${TERMINAL_INVITATION_ID},
          ${REVOKED_INVITATION_ID}, ${EXPIRED_INVITATION_ID}, ${WITHDRAWN_INVITATION_ID},
          ${EXTERNAL_INVITATION_ID}, ${RACING_INVITATION_ID}
        )
      `;
      await sql`
        delete from private.work_draft_contributor_backfill_items
        where invitation_id in (
          ${ACCEPTED_INVITATION_ID}, ${PENDING_INVITATION_ID}, ${TERMINAL_INVITATION_ID},
          ${REVOKED_INVITATION_ID}, ${EXPIRED_INVITATION_ID}, ${WITHDRAWN_INVITATION_ID},
          ${EXTERNAL_INVITATION_ID}, ${RACING_INVITATION_ID}
        )
      `;
      await sql`
        delete from private.attribution_invitation_sessions
        where invitation_id = ${EXTERNAL_INVITATION_ID}
      `;
      await sql`
        delete from private.attribution_invitations
        where id in (
          ${ACCEPTED_INVITATION_ID}, ${PENDING_INVITATION_ID}, ${TERMINAL_INVITATION_ID},
          ${REVOKED_INVITATION_ID}, ${EXPIRED_INVITATION_ID}, ${WITHDRAWN_INVITATION_ID},
          ${EXTERNAL_INVITATION_ID}, ${RACING_INVITATION_ID}
        )
      `;
      await sql`delete from private.work_drafts where work_id = ${WORK_ID}`;
      await sql`delete from public.works where id = ${WORK_ID}`;
      await sql`
        delete from public.account_roles
        where account_id in (
          ${SUBMITTER_ACCOUNT_ID}, ${ACCEPTED_ACCOUNT_ID}, ${PENDING_ACCOUNT_ID},
          ${TERMINAL_ACCOUNT_ID}
        )
      `;
      await sql`
        delete from public.accounts where id in (
          ${SUBMITTER_ACCOUNT_ID}, ${ACCEPTED_ACCOUNT_ID}, ${PENDING_ACCOUNT_ID},
          ${TERMINAL_ACCOUNT_ID}
        )
      `;
      await sql`delete from public.profile_consents where person_id = ${TERMINAL_PERSON_ID}`;
      await sql`delete from public.public_profiles where person_id = ${TERMINAL_PERSON_ID}`;
      await sql`
        delete from public.students where person_id in (
          ${SUBMITTER_PERSON_ID}, ${ACCEPTED_PERSON_ID}, ${PENDING_PERSON_ID},
          ${TERMINAL_PERSON_ID}
        )
      `;
      await sql`
        delete from private.person_names
        where person_id in (${ACCEPTED_PERSON_ID}, ${PENDING_PERSON_ID}, ${TERMINAL_PERSON_ID})
      `;
      await sql`
        delete from public.people
        where id in (
          ${SUBMITTER_PERSON_ID}, ${ACCEPTED_PERSON_ID}, ${PENDING_PERSON_ID},
          ${TERMINAL_PERSON_ID}, ${EXTERNAL_PERSON_ID}
        )
      `;
    });
  }
});
