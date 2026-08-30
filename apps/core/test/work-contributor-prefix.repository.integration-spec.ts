import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresWorkContributorsRepository } from '../src/modules/works/infrastructure/postgres-work-contributors.repository';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const NOW = new Date('2026-08-30T03:30:00.000Z');
const SUBMITTER_PERSON_ID = '78000000-0000-4000-8000-000000000001';
const CANDIDATE_PERSON_ID = '78000000-0000-4000-8000-000000000002';
const SUBMITTER_ACCOUNT_ID = '78000000-0000-4000-8000-000000000003';
const CANDIDATE_ACCOUNT_ID = '78000000-0000-4000-8000-000000000004';
const SUBMITTER_PROVIDER_ID = '78000000-0000-4000-8000-000000000005';
const CANDIDATE_PROVIDER_ID = '78000000-0000-4000-8000-000000000006';
const WORK_ID = '78000000-0000-4000-8000-000000000007';
const WORK_PUBLIC_ID = '78000000-0000-4000-8000-000000000008';
const STUDENT_ID_HASH = 'a'.repeat(64);
const STUDENT_ID_PREFIX_HASH = 'b'.repeat(64);

describe('PostgresWorkContributorsRepository Student ID prefix integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));

  afterAll(async () => database.onApplicationShutdown());

  it('uses the bounded Student ID prefix lookup index', async () => {
    const plan = await database.sql.begin(async (sql) => {
      await sql`set local enable_seqscan = off`;
      return sql<Array<{ 'QUERY PLAN': unknown }>>`
        explain (format json)
        select account_id
        from private.student_id_search_prefixes
        where prefix_hash = ${STUDENT_ID_PREFIX_HASH} and prefix_length = 1
        order by account_id
        limit 8
      `;
    });

    expect(JSON.stringify(plan)).toContain('student_id_search_prefixes_lookup_idx');
  });

  it('denies direct Data API roles access to the private prefix index', async () => {
    const privileges = await database.sql<
      Array<{ anon_can_select: boolean; authenticated_can_select: boolean }>
    >`
      select
        has_table_privilege(
          'anon', 'private.student_id_search_prefixes', 'select'
        ) as anon_can_select,
        has_table_privilege(
          'authenticated', 'private.student_id_search_prefixes', 'select'
        ) as authenticated_can_select
    `;

    expect(privileges).toEqual([{ anon_can_select: false, authenticated_can_select: false }]);
  });

  it('returns an opaque bounded candidate for prefix and exact Student ID hashes', async () => {
    const results = await database.sql.begin(async (sql) => {
      await sql`savepoint student_id_prefix_search`;
      try {
        await sql`
          insert into public.people (id, created_at) values
            (${SUBMITTER_PERSON_ID}, ${NOW}),
            (${CANDIDATE_PERSON_ID}, ${NOW})
        `;
        await sql`
          insert into public.students (
            person_id, entry_year, access_ends_academic_year, created_at
          ) values
            (${SUBMITTER_PERSON_ID}, 2569, 2576, ${NOW}),
            (${CANDIDATE_PERSON_ID}, 2569, 2576, ${NOW})
        `;
        await sql`
          insert into private.person_names (
            person_id, first_name_th, last_name_th, created_at, updated_at
          ) values (${CANDIDATE_PERSON_ID}, 'สมชาย', 'ใจดี', ${NOW}, ${NOW})
        `;
        await sql`
          insert into public.accounts (
            id, person_id, provider_user_id, credential_state, created_at, updated_at
          ) values
            (${SUBMITTER_ACCOUNT_ID}, ${SUBMITTER_PERSON_ID}, ${SUBMITTER_PROVIDER_ID},
              'set', ${NOW}, ${NOW}),
            (${CANDIDATE_ACCOUNT_ID}, ${CANDIDATE_PERSON_ID}, ${CANDIDATE_PROVIDER_ID},
              'set', ${NOW}, ${NOW})
        `;
        await sql`
          insert into public.account_roles (account_id, role, created_at) values
            (${SUBMITTER_ACCOUNT_ID}, 'student', ${NOW}),
            (${CANDIDATE_ACCOUNT_ID}, 'student', ${NOW})
        `;
        await sql`
          insert into private.student_auth_identities (
            account_id, student_id_hash, synthetic_identity, created_at
          ) values (
            ${CANDIDATE_ACCOUNT_ID}, ${STUDENT_ID_HASH},
            ${`${STUDENT_ID_HASH}@auth.invalid`}, ${NOW}
          )
        `;
        await sql`
          insert into private.student_id_search_prefixes (
            account_id, prefix_length, prefix_hash, created_at
          ) values (${CANDIDATE_ACCOUNT_ID}, 1, ${STUDENT_ID_PREFIX_HASH}, ${NOW})
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
          update private.issue_56_contributor_cutover_state set completed_at = ${NOW}
          where singleton = true
        `;

        const repository = new PostgresWorkContributorsRepository({
          sql: {
            begin: <T>(callback: (transaction: typeof sql) => Promise<T>) => callback(sql),
          },
        } as unknown as DatabaseClient);
        const prefix = await repository.searchCandidates({
          actorAccountId: SUBMITTER_ACCOUNT_ID,
          nameQuery: null,
          now: NOW,
          sourceKeyHash: 'c'.repeat(64),
          studentIdPrefixHash: STUDENT_ID_PREFIX_HASH,
          studentIdPrefixLength: 1,
          workPublicId: WORK_PUBLIC_ID,
        });
        const exact = await repository.searchCandidates({
          actorAccountId: SUBMITTER_ACCOUNT_ID,
          nameQuery: null,
          now: NOW,
          sourceKeyHash: 'd'.repeat(64),
          studentIdPrefixHash: STUDENT_ID_HASH,
          studentIdPrefixLength: 8,
          workPublicId: WORK_PUBLIC_ID,
        });
        return { exact, prefix };
      } finally {
        await sql`rollback to savepoint student_id_prefix_search`;
      }
    });

    for (const result of [results.prefix, results.exact]) {
      expect(result).toMatchObject({
        candidates: [{ firstName: 'สมชาย', lastName: 'ใจดี' }],
        outcome: 'matches',
      });
      expect(JSON.stringify(result)).not.toMatch(/accountId|personId|studentId/i);
    }
  });
});
