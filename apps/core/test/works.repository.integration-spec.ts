import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresWorksRepository } from '../src/modules/works/infrastructure/postgres-works.repository';

const PERSON_ID = '62000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '62000000-0000-4000-8000-000000000002';
const PROVIDER_USER_ID = '62000000-0000-4000-8000-000000000003';
const OTHER_PERSON_ID = '62000000-0000-4000-8000-000000000004';
const OTHER_ACCOUNT_ID = '62000000-0000-4000-8000-000000000005';
const OTHER_PROVIDER_USER_ID = '62000000-0000-4000-8000-000000000006';
const CREATE_KEY = '62000000-0000-4000-8000-000000000007';
const UPDATE_KEY = '62000000-0000-4000-8000-000000000008';
const CONCURRENT_UPDATE_KEY = '62000000-0000-4000-8000-000000000009';
const SEARCH_CREATE_KEY = '62000000-0000-4000-8000-000000000010';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresWorksRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresWorksRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${PERSON_ID}), (${OTHER_PERSON_ID})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${PERSON_ID}, 2566, 2573), (${OTHER_PERSON_ID}, 2566, 2573)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state)
        values
          (${ACCOUNT_ID}, ${PERSON_ID}, ${PROVIDER_USER_ID}, 'set'),
          (${OTHER_ACCOUNT_ID}, ${OTHER_PERSON_ID}, ${OTHER_PROVIDER_USER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ACCOUNT_ID}, 'student'), (${OTHER_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th)
        values (${PERSON_ID}, 'ชื่อ', 'ผู้ส่ง'), (${OTHER_PERSON_ID}, 'ชื่อ', 'บุคคลอื่น')
      `;
      await transaction`
        update public.academic_settings
        set current_academic_year = 2569, updated_at = ${new Date('2026-08-25T10:00:00.000Z')}
        where singleton = true
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('creates one private Draft with stable random public identity and immutable Submitter', async () => {
    await expect(repository.findAuthoringContext(ACCOUNT_ID)).resolves.toEqual({
      currentAcademicYear: 2569,
      entryYear: 2566,
      personId: PERSON_ID,
    });

    const created = await repository.createWork({
      actorAccountId: ACCOUNT_ID,
      draft: draft(),
      idempotencyKey: CREATE_KEY,
      now: new Date('2026-08-25T10:00:00.000Z'),
      submitterPersonId: PERSON_ID,
    });
    expect(created).toMatchObject({
      outcome: 'created',
      work: {
        activityState: 'active',
        basePublishedRevisionId: null,
        draft: draft(),
        publicationState: 'never_published',
        version: 1,
      },
    });
    if (!('work' in created)) throw new Error('WORK_CREATE_FAILED');
    expect(created.work.publicId).toMatch(/^[0-9a-f-]{36}$/);

    await expect(
      repository.findOwnedDraft(OTHER_ACCOUNT_ID, created.work.publicId),
    ).resolves.toBeNull();
    await expect(repository.findOwnedDraft(ACCOUNT_ID, created.work.publicId)).resolves.toEqual(
      created.work,
    );
    await expect(
      database.sql.begin(async (transaction) => {
        await transaction`set local role anon`;
        await transaction`select public_id from public.works where public_id = ${created.work.publicId}`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      database.sql`update public.works set submitter_person_id = ${OTHER_PERSON_ID} where public_id = ${created.work.publicId}`,
    ).rejects.toMatchObject({ message: 'WORK_SUBMITTER_IMMUTABLE' });
  });

  it('replays an equivalent create request and rejects an idempotency-key payload conflict', async () => {
    const replay = await repository.createWork({
      actorAccountId: ACCOUNT_ID,
      draft: draft(),
      idempotencyKey: CREATE_KEY,
      now: new Date('2026-08-25T10:00:00.000Z'),
      submitterPersonId: PERSON_ID,
    });
    expect(replay).toMatchObject({ outcome: 'replayed', work: { version: 1 } });

    await expect(
      repository.createWork({
        actorAccountId: ACCOUNT_ID,
        draft: draft({ title: 'คนละข้อมูล' }),
        idempotencyKey: CREATE_KEY,
        now: new Date('2026-08-25T10:00:00.000Z'),
        submitterPersonId: PERSON_ID,
      }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });

    const count = await database.sql<{ count: number }[]>`
      select count(*)::integer as count from public.works where submitter_person_id = ${PERSON_ID}
    `;
    expect(count).toEqual([{ count: 1 }]);
  });

  it('searches one literal character and returns bounded filter totals for only the Submitter', async () => {
    await repository.createWork({
      actorAccountId: ACCOUNT_ID,
      draft: draft({ title: 'ค้นหา 100% งาน' }),
      idempotencyKey: SEARCH_CREATE_KEY,
      now: new Date('2026-08-25T10:02:00.000Z'),
      submitterPersonId: PERSON_ID,
    });

    const page = await repository.listOwnedWorks({
      accountId: ACCOUNT_ID,
      category: 'course_work',
      cursor: null,
      limit: 12,
      page: 1,
      query: '%',
      sort: 'updated_asc',
      status: 'draft',
      view: 'current',
    });

    expect(page).toMatchObject({ pageSize: 12, totalItems: 1, totalPages: 1 });
    expect(page.items.map((item) => item.title)).toEqual(['ค้นหา 100% งาน']);
    await expect(
      repository.listOwnedWorks({
        accountId: OTHER_ACCOUNT_ID,
        category: 'all',
        cursor: null,
        limit: 12,
        page: 1,
        query: 'ค',
        sort: 'updated_desc',
        status: 'all',
        view: 'current',
      }),
    ).resolves.toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
  });

  it('atomically accepts one expected-version update and preserves data on the stale attempt', async () => {
    const current = await database.sql<{ public_id: string }[]>`
      select public_id from public.works where submitter_person_id = ${PERSON_ID}
    `;
    const publicId = current[0]!.public_id;
    const updateInput = (idempotencyKey: string, title: string) => ({
      actorAccountId: ACCOUNT_ID,
      draft: draft({ title }),
      expectedVersion: 1,
      idempotencyKey,
      now: new Date('2026-08-25T10:05:00.000Z'),
      publicId,
    });
    const attempts = [
      updateInput(UPDATE_KEY, 'ฉบับที่ชนะ'),
      updateInput(CONCURRENT_UPDATE_KEY, 'ฉบับที่ขัดแย้ง'),
    ];

    const outcomes = await Promise.all(attempts.map((input) => repository.updateDraft(input)));
    const updated = outcomes.find((result) => result.outcome === 'updated');
    if (updated === undefined || !('work' in updated)) throw new Error('WORK_UPDATE_FAILED');
    const winningIndex = outcomes.findIndex((result) => result.outcome === 'updated');
    const winningInput = attempts[winningIndex];
    if (winningInput === undefined) throw new Error('WORK_UPDATE_INPUT_NOT_FOUND');
    expect(updated.work.version).toBe(2);
    expect(outcomes.some((result) => result.outcome === 'version_conflict')).toBe(true);
    // Model response loss after commit by discarding the first response and retrying the same input.
    await expect(repository.updateDraft(winningInput)).resolves.toMatchObject({
      outcome: 'replayed',
      work: { version: 2 },
    });
    await expect(
      repository.updateDraft({ ...winningInput, draft: draft({ title: 'ขัดแย้งหลัง commit' }) }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });
    const operations = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.work_operations
      where idempotency_key = ${winningInput.idempotencyKey}
    `;
    expect(operations).toEqual([{ count: 1 }]);

    const persisted = await repository.findOwnedDraft(ACCOUNT_ID, publicId);
    expect(persisted).toMatchObject({ version: 2 });
    expect(['ฉบับที่ชนะ', 'ฉบับที่ขัดแย้ง']).toContain(persisted?.draft.title);
    const rejectedTitle = persisted?.draft.title === 'ฉบับที่ชนะ' ? 'ฉบับที่ขัดแย้ง' : 'ฉบับที่ชนะ';
    expect(persisted?.draft.title).not.toBe(rejectedTitle);
  });

  it('exposes a consented, ready-photo Contributor via findOwnedDraft and hides it after withdrawal', async () => {
    const CONTRIBUTOR_PROFILE_PUBLIC_ID = '62000000-0000-4000-8000-000000000011';
    const CONTRIBUTOR_PHOTO_ID = '62000000-0000-4000-8000-000000000012';
    const now = new Date('2026-08-25T10:10:00.000Z');

    const created = await repository.createWork({
      actorAccountId: ACCOUNT_ID,
      draft: draft({ title: 'ผลงานสำหรับทดสอบรูปโปรไฟล์' }),
      idempotencyKey: '62000000-0000-4000-8000-000000000013',
      now,
      submitterPersonId: PERSON_ID,
    });
    if (!('work' in created)) throw new Error('WORK_CREATE_FAILED');
    const workId = (
      await database.sql<
        { id: string }[]
      >`select id from public.works where public_id = ${created.work.publicId}`
    )[0]!.id;

    try {
      await database.sql`
        insert into private.profile_photo_assets (
          id, person_id, status, quarantine_object_key, sanitized_object_key,
          declared_content_type, declared_byte_size, inspected_content_type,
          inspected_byte_size, width, height, created_at, updated_at, expires_at
        ) values (
          ${CONTRIBUTOR_PHOTO_ID}, ${OTHER_PERSON_ID}, 'ready',
          ${`quarantine/${CONTRIBUTOR_PHOTO_ID}`}, ${`profiles/${CONTRIBUTOR_PHOTO_ID}.webp`},
          'image/webp', 1024, 'image/webp', 1024, 512, 512, ${now}, ${now},
          ${new Date('2026-09-01T15:00:00.000Z')}
        )
      `;
      await database.sql`
        insert into public.public_profiles (person_id, public_id, photo_id, created_at, updated_at)
        values (
          ${OTHER_PERSON_ID}, ${CONTRIBUTOR_PROFILE_PUBLIC_ID}, ${CONTRIBUTOR_PHOTO_ID}, ${now}, ${now}
        )
      `;
      await database.sql`
        insert into public.profile_consents (person_id, consent_text_version, granted_at)
        values (${OTHER_PERSON_ID}, 'phase-1', ${now})
      `;
      await database.sql`
        insert into private.work_draft_contributors (
          work_id, kind, person_id, attribution_name, contribution_role,
          position, created_at, updated_at
        ) values (
          ${workId}, 'account', ${OTHER_PERSON_ID}, 'ชื่อผู้ร่วมผลงาน', 'พัฒนาระบบ', 1, ${now}, ${now}
        )
      `;

      await expect(
        repository.findOwnedDraft(ACCOUNT_ID, created.work.publicId),
      ).resolves.toMatchObject({
        contributors: [
          {
            attributionName: 'ชื่อผู้ร่วมผลงาน',
            hasPhoto: true,
            profilePublicId: CONTRIBUTOR_PROFILE_PUBLIC_ID,
          },
        ],
      });

      await database.sql`
        update public.profile_consents set withdrawn_at = ${new Date(now.getTime() + 1_000)}
        where person_id = ${OTHER_PERSON_ID}
      `;

      await expect(
        repository.findOwnedDraft(ACCOUNT_ID, created.work.publicId),
      ).resolves.toMatchObject({
        contributors: [{ hasPhoto: false, profilePublicId: null }],
      });
    } finally {
      await database.sql`delete from private.work_draft_contributors where work_id = ${workId}`;
      await database.sql`delete from public.profile_consents where person_id = ${OTHER_PERSON_ID}`;
      await database.sql`delete from public.public_profiles where person_id = ${OTHER_PERSON_ID}`;
      await database.sql`delete from private.profile_photo_assets where id = ${CONTRIBUTOR_PHOTO_ID}`;
    }
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.work_operations
        where actor_account_id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await transaction`
        delete from public.works where submitter_person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`
        delete from public.account_roles where account_id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await transaction`
        delete from public.accounts where id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await transaction`
        delete from public.students where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`
        delete from private.person_names where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`delete from public.people where id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
    });
  }
});

function draft(overrides: Partial<ReturnType<typeof draftBase>> = {}) {
  return { ...draftBase(), ...overrides };
}

function draftBase() {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    category: 'course_work' as const,
    description: 'รายละเอียดผลงาน',
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
    summary: 'สรุปผลงาน',
    tags: [
      { displayLabel: 'React', normalizedIdentity: 'react' },
      { displayLabel: 'Web App', normalizedIdentity: 'web app' },
    ],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [
      {
        provider: 'youtube' as const,
        providerVideoId: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      {
        provider: 'tiktok' as const,
        providerVideoId: '7345678901234567890',
        url: 'https://www.tiktok.com/@showcase/video/7345678901234567890',
      },
    ],
  };
}
