import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresWorksRepository } from '../src/modules/works/infrastructure/postgres-works.repository';
import { PostgresWorkRevisionsRepository } from '../src/modules/works/infrastructure/postgres-work-revisions.repository';

const PERSON_ID = '8a000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '8a000000-0000-4000-8000-000000000002';
const PROVIDER_ID = '8a000000-0000-4000-8000-000000000003';
const WORK_ID = '8a000000-0000-4000-8000-000000000004';
const WORK_PUBLIC_ID = '8a000000-0000-4000-8000-000000000005';
const FIRST_REVISION_ID = '8a000000-0000-4000-8000-000000000006';
const FIRST_REVISION_PUBLIC_ID = '8a000000-0000-4000-8000-000000000007';
const SECOND_REVISION_ID = '8a000000-0000-4000-8000-000000000008';
const SECOND_REVISION_PUBLIC_ID = '8a000000-0000-4000-8000-000000000009';
const SEED_KEY = '8a000000-0000-4000-8000-000000000010';
const UPDATE_KEY = '8a000000-0000-4000-8000-000000000011';
const REBASE_KEY = '8a000000-0000-4000-8000-000000000012';
const REACTIVATE_KEY = '8a000000-0000-4000-8000-000000000014';
const NOW = new Date('2026-08-26T03:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresWorksRepository published Draft lifecycle integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresWorksRepository(database);
  const revisions = new PostgresWorkRevisionsRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${PERSON_ID})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${PERSON_ID}, 2566, 2573)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state)
        values (${ACCOUNT_ID}, ${PERSON_ID}, ${PROVIDER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role) values (${ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into public.works (
          id, public_id, submitter_person_id, activity_state, publication_state,
          created_at, updated_at
        ) values (
          ${WORK_ID}, ${WORK_PUBLIC_ID}, ${PERSON_ID}, 'active', 'never_published', ${NOW}, ${NOW}
        )
      `;
      await insertApprovedRevision(
        transaction,
        FIRST_REVISION_ID,
        FIRST_REVISION_PUBLIC_ID,
        1,
        null,
        'ฉบับเผยแพร่เดิม',
      );
      await transaction`
        update public.works
        set publication_state = 'published', published_revision_id = ${FIRST_REVISION_ID}
        where id = ${WORK_ID}
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('seeds one private Draft from the expected Published Revision with equivalent retry safety', async () => {
    await expect(repository.findOwnedWorkState(ACCOUNT_ID, WORK_PUBLIC_ID)).resolves.toMatchObject({
      draft: null,
      publicationState: 'published',
      publishedRevisionId: FIRST_REVISION_ID,
    });
    await expect(
      repository.seedDraft(seedInput({ expectedPublishedRevisionId: SECOND_REVISION_ID })),
    ).resolves.toEqual({ outcome: 'published_revision_conflict' });

    const retries = await Promise.all([
      repository.seedDraft(seedInput()),
      repository.seedDraft(seedInput()),
    ]);
    expect(retries.map((result) => result.outcome).sort()).toEqual(['created', 'replayed']);
    const state = await repository.findOwnedWorkState(ACCOUNT_ID, WORK_PUBLIC_ID);
    expect(state).toMatchObject({
      draft: {
        basePublishedRevisionId: FIRST_REVISION_ID,
        draft: { title: 'ฉบับเผยแพร่เดิม' },
        publishedRevisionId: FIRST_REVISION_ID,
        version: 1,
      },
    });
  });

  it('retains local content and immutable history during explicit rebase to a changed pointer', async () => {
    await repository.updateDraft({
      actorAccountId: ACCOUNT_ID,
      draft: draft('เนื้อหาในร่างที่ต้องเก็บไว้'),
      expectedVersion: 1,
      idempotencyKey: UPDATE_KEY,
      now: new Date(NOW.getTime() + 1_000),
      publicId: WORK_PUBLIC_ID,
    });
    await database.sql.begin(async (transaction) => {
      await insertApprovedRevision(
        transaction,
        SECOND_REVISION_ID,
        SECOND_REVISION_PUBLIC_ID,
        2,
        FIRST_REVISION_ID,
        'ฉบับเผยแพร่จากอีก transition',
      );
      await transaction`
        update public.works set published_revision_id = ${SECOND_REVISION_ID}
        where id = ${WORK_ID}
      `;
    });

    const stale = await repository.findOwnedWorkState(ACCOUNT_ID, WORK_PUBLIC_ID);
    expect(stale).toMatchObject({
      draft: {
        basePublishedRevisionId: FIRST_REVISION_ID,
        draft: { title: 'เนื้อหาในร่างที่ต้องเก็บไว้' },
        version: 2,
      },
      publishedRevisionId: SECOND_REVISION_ID,
    });
    await expect(
      revisions.submitRevision({
        actorAccountId: ACCOUNT_ID,
        draft: draft('เนื้อหาในร่างที่ต้องเก็บไว้'),
        expectedBasePublishedRevisionId: FIRST_REVISION_ID,
        expectedDraftVersion: 2,
        idempotencyKey: '8a000000-0000-4000-8000-000000000013',
        now: new Date(NOW.getTime() + 2_000),
        studyYear: 2,
        workPublicId: WORK_PUBLIC_ID,
      }),
    ).resolves.toEqual({ outcome: 'base_revision_conflict' });
    await expect(
      repository.rebaseDraft(rebaseInput({ expectedPublishedRevisionId: FIRST_REVISION_ID })),
    ).resolves.toEqual({ outcome: 'published_revision_conflict' });

    const rebaseAttempts = await Promise.all([
      repository.rebaseDraft(rebaseInput()),
      repository.rebaseDraft(rebaseInput()),
    ]);
    expect(rebaseAttempts.map((result) => result.outcome).sort()).toEqual(['replayed', 'updated']);
    for (const rebased of rebaseAttempts) {
      expect(rebased).toMatchObject({
        work: {
          basePublishedRevisionId: SECOND_REVISION_ID,
          draft: { title: 'เนื้อหาในร่างที่ต้องเก็บไว้' },
          publishedRevisionId: SECOND_REVISION_ID,
          version: 3,
        },
      });
    }

    const history = await database.sql<Array<{ count: number; titles: string[] }>>`
      select count(*)::integer as count, array_agg(title order by revision_number) as titles
      from private.work_revisions where work_id = ${WORK_ID}
    `;
    expect(history).toEqual([
      { count: 2, titles: ['ฉบับเผยแพร่เดิม', 'ฉบับเผยแพร่จากอีก transition'] },
    ]);
  });

  it('retains a consumed Draft and safely reactivates it from the current Published Revision', async () => {
    await database.sql`
      update private.work_drafts set lifecycle_state = 'retained' where work_id = ${WORK_ID}
    `;
    await expect(repository.findOwnedWorkState(ACCOUNT_ID, WORK_PUBLIC_ID)).resolves.toMatchObject({
      draft: null,
      publishedRevisionId: SECOND_REVISION_ID,
    });

    const result = await repository.seedDraft({
      actorAccountId: ACCOUNT_ID,
      expectedPublishedRevisionId: SECOND_REVISION_ID,
      idempotencyKey: REACTIVATE_KEY,
      now: new Date(NOW.getTime() + 3_000),
      publicId: WORK_PUBLIC_ID,
    });

    expect(result).toMatchObject({
      outcome: 'created',
      work: {
        basePublishedRevisionId: SECOND_REVISION_ID,
        draft: { submitterStudyYear: 2, title: 'ฉบับเผยแพร่จากอีก transition' },
        version: 4,
      },
    });
    const retained = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.work_drafts where work_id = ${WORK_ID}
    `;
    expect(retained).toEqual([{ count: 1 }]);
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.work_operations where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_video_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_tags where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_drafts where work_id = ${WORK_ID}`;
      await transaction`
        delete from private.work_revision_video_links where revision_id in (
          ${FIRST_REVISION_ID}, ${SECOND_REVISION_ID}
        )
      `;
      await transaction`
        delete from private.work_revision_tags where revision_id in (
          ${FIRST_REVISION_ID}, ${SECOND_REVISION_ID}
        )
      `;
      await transaction`
        delete from private.work_revision_links where revision_id in (
          ${FIRST_REVISION_ID}, ${SECOND_REVISION_ID}
        )
      `;
      await transaction`
        delete from private.work_revision_attributions where revision_id in (
          ${FIRST_REVISION_ID}, ${SECOND_REVISION_ID}
        )
      `;
      await transaction`
        delete from private.work_revisions where id in (${FIRST_REVISION_ID}, ${SECOND_REVISION_ID})
      `;
      await transaction`delete from public.works where id = ${WORK_ID}`;
      await transaction`delete from public.account_roles where account_id = ${ACCOUNT_ID}`;
      await transaction`delete from public.accounts where id = ${ACCOUNT_ID}`;
      await transaction`delete from public.students where person_id = ${PERSON_ID}`;
      await transaction`delete from public.people where id = ${PERSON_ID}`;
    });
  }
});

async function insertApprovedRevision(
  transaction: import('postgres').TransactionSql,
  id: string,
  publicId: string,
  number: number,
  baseRevisionId: string | null,
  title: string,
): Promise<void> {
  await transaction`
    insert into private.work_revisions (
      id, public_id, work_id, revision_number, status, base_published_revision_id,
      draft_version, title, summary, description, category, academic_year, semester,
      submitted_at, version
    ) values (
      ${id}, ${publicId}, ${WORK_ID}, ${number}, 'approved', ${baseRevisionId},
      1, ${title}, 'สรุป', 'รายละเอียด', 'course_work', 2569, '1', ${NOW}, 2
    )
  `;
  await transaction`
    insert into private.work_revision_links (revision_id, position, label, url)
    values (${id}, 1, 'เว็บไซต์', 'https://example.com/')
  `;
  await transaction`
    insert into private.work_revision_tags (
      revision_id, position, display_label, normalized_identity
    ) values (${id}, 1, 'React', 'react')
  `;
  await transaction`
    insert into private.work_revision_attributions (
      revision_id, position, kind, person_id, attribution_name, study_year,
      attribution_model_version
    ) values (${id}, 1, 'submitter', ${PERSON_ID}, 'ผู้ส่ง', 2, 2)
  `;
}

function seedInput(overrides: Partial<Parameters<PostgresWorksRepository['seedDraft']>[0]> = {}) {
  return {
    actorAccountId: ACCOUNT_ID,
    expectedPublishedRevisionId: FIRST_REVISION_ID,
    idempotencyKey: SEED_KEY,
    now: NOW,
    publicId: WORK_PUBLIC_ID,
    ...overrides,
  };
}

function rebaseInput(
  overrides: Partial<Parameters<PostgresWorksRepository['rebaseDraft']>[0]> = {},
) {
  return {
    actorAccountId: ACCOUNT_ID,
    expectedPublishedRevisionId: SECOND_REVISION_ID,
    expectedVersion: 2,
    idempotencyKey: REBASE_KEY,
    now: new Date(NOW.getTime() + 2_000),
    publicId: WORK_PUBLIC_ID,
    ...overrides,
  };
}

function draft(title: string) {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    category: 'course_work' as const,
    description: 'รายละเอียดในร่าง',
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
    summary: 'สรุปในร่าง',
    tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
    title,
    videoLinks: [],
  };
}
