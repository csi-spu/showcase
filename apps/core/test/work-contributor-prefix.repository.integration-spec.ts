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
const CANDIDATE_PROFILE_PUBLIC_ID = '78000000-0000-4000-8000-000000000009';
const CANDIDATE_PHOTO_ID = '78000000-0000-4000-8000-000000000010';

describe('PostgresWorkContributorsRepository Student ID prefix integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));

  afterAll(async () => database.onApplicationShutdown());

  it('uses the bounded Student ID prefix lookup index', async () => {
    const indexes = await database.sql<Array<{ indexdef: string }>>`
      select indexdef
      from pg_indexes
      where schemaname = 'private'
        and tablename = 'student_id_search_prefixes'
        and indexname = 'student_id_search_prefixes_lookup_idx'
    `;

    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.indexdef).toContain('(prefix_hash, prefix_length, account_id)');
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
          insert into private.profile_photo_assets (
            id, person_id, status, quarantine_object_key, sanitized_object_key,
            declared_content_type, declared_byte_size, inspected_content_type,
            inspected_byte_size, width, height, created_at, updated_at, expires_at
          ) values (
            ${CANDIDATE_PHOTO_ID}, ${CANDIDATE_PERSON_ID}, 'ready',
            ${`quarantine/${CANDIDATE_PHOTO_ID}`}, ${`profiles/${CANDIDATE_PHOTO_ID}.webp`},
            'image/webp', 1024, 'image/webp', 1024, 512, 512, ${NOW}, ${NOW},
            ${new Date('2026-09-01T03:30:00.000Z')}
          )
        `;
        await sql`
          insert into public.public_profiles (person_id, public_id, photo_id, created_at, updated_at)
          values (
            ${CANDIDATE_PERSON_ID}, ${CANDIDATE_PROFILE_PUBLIC_ID}, ${CANDIDATE_PHOTO_ID},
            ${NOW}, ${NOW}
          )
        `;
        await sql`
          insert into public.profile_consents (person_id, consent_text_version, granted_at)
          values (${CANDIDATE_PERSON_ID}, 'phase-1', ${NOW})
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
        if (prefix.outcome !== 'matches') throw new Error('PREFIX_SEARCH_FAILED');
        const candidateReference = prefix.candidates[0]?.candidateReference;
        if (candidateReference === undefined) throw new Error('PREFIX_CANDIDATE_MISSING');
        const added = await repository.addAccount({
          actorAccountId: SUBMITTER_ACCOUNT_ID,
          candidateReference,
          contributionRole: 'พัฒนาระบบ',
          expectedVersion: 1,
          idempotencyKey: '78000000-0000-4000-8000-000000000011',
          now: NOW,
          workPublicId: WORK_PUBLIC_ID,
        });
        await sql`
          update public.profile_consents set withdrawn_at = ${new Date(NOW.getTime() + 1_000)}
          where person_id = ${CANDIDATE_PERSON_ID}
        `;
        const withdrawn = await repository.addExternal({
          actorAccountId: SUBMITTER_ACCOUNT_ID,
          attributionName: 'บุคคลภายนอก',
          contributionRole: 'ออกแบบ',
          expectedVersion: 2,
          idempotencyKey: '78000000-0000-4000-8000-000000000012',
          now: new Date(NOW.getTime() + 2_000),
          workPublicId: WORK_PUBLIC_ID,
        });
        return { added, exact, prefix, withdrawn };
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
    expect(results.added).toMatchObject({
      contributors: [
        {
          hasPhoto: true,
          profilePublicId: CANDIDATE_PROFILE_PUBLIC_ID,
        },
      ],
      outcome: 'added',
    });
    expect(results.withdrawn).toMatchObject({
      contributors: [
        {
          hasPhoto: false,
          profilePublicId: null,
        },
        {
          hasPhoto: false,
          profilePublicId: null,
        },
      ],
      outcome: 'added',
    });
  });
});
