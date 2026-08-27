import { ConfigService } from '@nestjs/config';
import type postgres from 'postgres';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresCatalogRepository } from '../src/modules/catalog/infrastructure/postgres-catalog.repository';
import {
  normalizePeopleCatalogQuery,
  normalizeWorkCatalogQuery,
} from '../src/modules/catalog/domain/catalog-query-policy';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const NOW = new Date('2026-08-26T08:00:00.000Z');
const IDS = {
  adminAccount: id(1),
  adminPerson: id(2),
  adminProvider: id(3),
  consentedPerson: id(4),
  consentedProfile: id(5),
  hiddenPerson: id(6),
  hiddenProfile: id(7),
  secondConsentedPerson: id(23),
  secondConsentedProfile: id(24),
  thirdConsentedPerson: id(25),
  thirdConsentedProfile: id(26),
  workOne: id(8),
  workOnePublic: id(9),
  revisionOne: id(10),
  revisionOnePublic: id(11),
  workTwo: id(12),
  workTwoPublic: id(13),
  revisionTwo: id(14),
  revisionTwoPublic: id(15),
  poster: id(16),
  tagReact: id(17),
  tagReactPublic: id(18),
  tagNest: id(19),
  tagNestPublic: id(20),
  tagZero: id(21),
  tagZeroPublic: id(22),
} as const;

describe('PostgresCatalogRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresCatalogRepository(
    database,
    new ConfigService({ PUBLIC_MEDIA_ORIGIN: 'https://media.example.test' }),
  );

  beforeAll(async () => {
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('searches weighted approved fields and applies Category OR plus Tag AND filters', async () => {
    const search = await repository.listWorks({
      after: null,
      query: normalizeWorkCatalogQuery({ limit: '24', q: 'react' }),
    });
    expect(search.entries.map((entry) => entry.item.title)).toEqual([
      'React Catalog',
      'API Catalog',
    ]);
    expect(search.entries[0]?.item.poster).toMatchObject({
      assetId: IDS.poster,
      variants: [{ height: 720, width: 480 }],
    });
    expect(JSON.stringify(search)).not.toMatch(/studentId|accountId|personId|description/i);

    const filtered = await repository.listWorks({
      after: null,
      query: normalizeWorkCatalogQuery({
        category: ['academic_article', 'course_work'],
        tag: [IDS.tagReactPublic, IDS.tagNestPublic],
      }),
    });
    expect(filtered.entries.map((entry) => entry.item.workPublicId)).toEqual([IDS.workOnePublic]);
  });

  it('returns only consented Public Profiles and exact active Published Work counts', async () => {
    const people = await repository.listPeople({
      after: null,
      query: normalizePeopleCatalogQuery({ q: 'ณัฐดนัย' }),
    });
    expect(people.entries).toHaveLength(1);
    expect(people.entries[0]?.item).toMatchObject({
      bio: 'สนใจระบบเว็บที่ใช้งานง่าย',
      displayName: 'ณัฐดนัย',
      publicId: IDS.consentedProfile,
      publishedWorkCount: 2,
    });
    expect(JSON.stringify(people)).not.toContain(IDS.hiddenProfile);
  });

  it('continues People relevance results in name order when ranks tie', async () => {
    const query = normalizePeopleCatalogQuery({ limit: '1', q: 'ณัฐ' });
    const first = await repository.listPeople({ after: null, query });
    const firstEntry = first.entries[0];
    const expectedNext = first.entries[1];
    expect(firstEntry).toBeDefined();
    expect(expectedNext).toBeDefined();

    const continued = await repository.listPeople({
      after: firstEntry?.position ?? null,
      query,
    });

    expect(continued.entries[0]?.item.publicId).toBe(expectedNext?.item.publicId);
  });

  it('hides zero-count Tags and reconciles exact popularity idempotently', async () => {
    await expect(repository.listPopularTags()).resolves.toEqual([
      { activeWorkCount: 2, displayLabel: 'React', publicId: IDS.tagReactPublic },
      { activeWorkCount: 1, displayLabel: 'NestJS', publicId: IDS.tagNestPublic },
    ]);
    await expect(repository.findTag(IDS.tagZeroPublic)).resolves.toBeNull();

    await database.sql`update public.tags set active_work_count = 99 where id = ${IDS.tagNest}`;
    const changed = await database.sql<Array<{ changed_count: number }>>`
      select private.reconcile_tag_popularity() as changed_count
    `;
    expect(changed[0]?.changed_count).toBe(1);
    await expect(database.sql`select private.reconcile_tag_popularity()`).resolves.toBeDefined();
    await expect(repository.findTag(IDS.tagNestPublic)).resolves.toMatchObject({
      activeWorkCount: 1,
    });
  });

  it('builds sitemap shards only from current public eligibility', async () => {
    await expect(repository.listSitemapEntries('works', 0x97)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ publicId: IDS.workOnePublic }),
        expect.objectContaining({ publicId: IDS.workTwoPublic }),
      ]),
    );
    const people = await repository.listSitemapEntries('people', 0x97);
    expect(people.map((entry) => entry.publicId)).toEqual(
      expect.arrayContaining([
        IDS.consentedProfile,
        IDS.secondConsentedProfile,
        IDS.thirdConsentedProfile,
      ]),
    );
    expect(people.map((entry) => entry.publicId)).not.toContain(IDS.hiddenProfile);
    const tags = await repository.listSitemapEntries('tags', 0x97);
    expect(tags.map((entry) => entry.publicId)).toEqual(
      expect.arrayContaining([IDS.tagReactPublic, IDS.tagNestPublic]),
    );
    expect(tags.map((entry) => entry.publicId)).not.toContain(IDS.tagZeroPublic);
  });

  it('uses the trigram index for the real partial-search predicate', async () => {
    await database.sql`set enable_seqscan = off`;
    const plan = await database.sql<Array<{ 'QUERY PLAN': string }>>`
      explain select work_id from private.public_work_catalog
      where normalized_search like ${'%react%'} order by published_at desc limit 25
    `;
    await database.sql`reset enable_seqscan`;
    expect(plan.map((line) => line['QUERY PLAN']).join('\n')).toContain(
      'public_work_catalog_search_idx',
    );
  });

  it('uses matching indexes for browse, filter, sort, People, and Tag paths', async () => {
    await database.sql`set enable_seqscan = off`;
    const [recent, period, title, people, tags] = await Promise.all([
      explain(database.sql`
        select work_id from private.public_work_catalog
        where category = 'course_work'
        order by published_at desc, work_public_id desc limit 25
      `),
      explain(database.sql`
        select work_id from private.public_work_catalog
        where academic_year = 2569 and semester = '1'
        order by published_at desc, work_public_id desc limit 25
      `),
      explain(database.sql`
        select work_id from private.public_work_catalog
        order by normalized_title, work_public_id limit 25
      `),
      explain(database.sql`
        select public_id from public.public_profiles
        order by normalized_display_name, public_id limit 25
      `),
      explain(database.sql`
        select public_id from public.tags where active_work_count > 0
        order by active_work_count desc, lower(display_label), public_id limit 20
      `),
    ]);
    await database.sql`reset enable_seqscan`;

    expect(recent).toContain('public_work_catalog_category_recent_idx');
    expect(period).toContain('public_work_catalog_period_recent_idx');
    expect(title).toContain('public_work_catalog_title_idx');
    expect(people).toContain('public_profiles_display_name_browse_idx');
    expect(tags).toContain('tags_public_popularity_idx');
  });

  async function seed(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values
        (${IDS.adminPerson}), (${IDS.consentedPerson}), (${IDS.hiddenPerson}),
        (${IDS.secondConsentedPerson}), (${IDS.thirdConsentedPerson})`;
      await transaction`insert into public.students (
        person_id, entry_year, access_ends_academic_year
      ) values
        (${IDS.consentedPerson}, 2566, 2573),
        (${IDS.hiddenPerson}, 2567, 2574),
        (${IDS.secondConsentedPerson}, 2565, 2572),
        (${IDS.thirdConsentedPerson}, 2564, 2571)`;
      await transaction`insert into public.accounts (
        id, person_id, provider_user_id, credential_state
      ) values (${IDS.adminAccount}, ${IDS.adminPerson}, ${IDS.adminProvider}, 'set')`;
      await transaction`insert into public.account_roles (account_id, role)
        values (${IDS.adminAccount}, 'admin')`;
      await transaction`insert into public.public_profiles (
        person_id, public_id, display_name, bio, version, created_at, updated_at
      ) values
        (${IDS.consentedPerson}, ${IDS.consentedProfile}, 'ณัฐดนัย', 'สนใจระบบเว็บที่ใช้งานง่าย', 1, ${NOW}, ${NOW}),
        (${IDS.hiddenPerson}, ${IDS.hiddenProfile}, 'ณัฐที่ซ่อนอยู่', 'ข้อมูลที่ห้ามเผยแพร่', 1, ${NOW}, ${NOW}),
        (${IDS.secondConsentedPerson}, ${IDS.secondConsentedProfile}, 'ณัฐกร', null, 1, ${NOW}, ${NOW}),
        (${IDS.thirdConsentedPerson}, ${IDS.thirdConsentedProfile}, 'ณัฐวุฒิ', null, 1, ${NOW}, ${NOW})`;
      await transaction`insert into public.profile_consents (
        person_id, consent_text_version, granted_at
      ) values
        (${IDS.consentedPerson}, 'phase-1', ${NOW}),
        (${IDS.secondConsentedPerson}, 'phase-1', ${NOW}),
        (${IDS.thirdConsentedPerson}, 'phase-1', ${NOW})`;
      await transaction`insert into public.works (
        id, public_id, submitter_person_id, activity_state, publication_state,
        created_at, updated_at
      ) values
        (${IDS.workOne}, ${IDS.workOnePublic}, ${IDS.consentedPerson}, 'active', 'published', ${NOW}, ${NOW}),
        (${IDS.workTwo}, ${IDS.workTwoPublic}, ${IDS.consentedPerson}, 'active', 'published', ${NOW}, ${NOW})`;
      await transaction`insert into private.work_revisions (
        id, public_id, work_id, revision_number, status, draft_version, title, summary,
        description, category, academic_year, semester, submitted_at, version
      ) values
        (${IDS.revisionOne}, ${IDS.revisionOnePublic}, ${IDS.workOne}, 1, 'approved', 1,
          'React Catalog', 'ระบบค้นหา', 'รายละเอียด', 'course_work', 2569, '1', ${NOW}, 2),
        (${IDS.revisionTwo}, ${IDS.revisionTwoPublic}, ${IDS.workTwo}, 1, 'approved', 1,
          'API Catalog', 'ใช้ React', 'รายละเอียด', 'academic_article', 2568, '2', ${NOW}, 2)`;
      await transaction`update public.works set published_revision_id = case
        when id = ${IDS.workOne} then ${IDS.revisionOne}::uuid else ${IDS.revisionTwo}::uuid end`;
      await transaction`insert into private.reviews (
        revision_id, actor_account_id, decision, expected_revision_version,
        resulting_revision_version, idempotency_key, request_payload, reviewed_at
      ) values
        (${IDS.revisionOne}, ${IDS.adminAccount}, 'approved', 1, 2, ${id(30)}, '{}'::jsonb, ${NOW}),
        (${IDS.revisionTwo}, ${IDS.adminAccount}, 'approved', 1, 2, ${id(31)}, '{}'::jsonb,
          ${new Date(NOW.getTime() - 1_000)})`;
      await transaction`insert into private.work_revision_attributions (
        revision_id, position, kind, person_id, attribution_name, study_year
      ) values
        (${IDS.revisionOne}, 1, 'submitter', ${IDS.consentedPerson}, 'ณัฐดนัย', 3),
        (${IDS.revisionTwo}, 1, 'submitter', ${IDS.consentedPerson}, 'ณัฐดนัย', 2)`;
      await transaction`insert into public.tags (
        id, public_id, normalized_identity, display_label, activated_at, active_work_count
      ) values
        (${IDS.tagReact}, ${IDS.tagReactPublic}, 'react', 'React', ${NOW}, 2),
        (${IDS.tagNest}, ${IDS.tagNestPublic}, 'nestjs', 'NestJS', ${NOW}, 1),
        (${IDS.tagZero}, ${IDS.tagZeroPublic}, 'retained', 'Retained', ${NOW}, 0)`;
      await transaction`insert into private.published_revision_tags (revision_id, tag_id, position)
        values
          (${IDS.revisionOne}, ${IDS.tagReact}, 1),
          (${IDS.revisionOne}, ${IDS.tagNest}, 2),
          (${IDS.revisionTwo}, ${IDS.tagReact}, 1)`;
      await transaction`insert into private.work_media_assets (
        id, work_id, media_kind, status, quarantine_object_key, authorize_idempotency_key,
        master_object_key, declared_content_type, declared_extension, declared_byte_size,
        inspected_byte_size, width, height, content_hash, dominant_color,
        created_at, updated_at, expires_at
      ) values (${IDS.poster}, ${IDS.workOne}, 'poster', 'ready', ${`quarantine/${IDS.poster}`},
        ${id(32)}, ${`media/${IDS.poster}/master.webp`}, 'image/jpeg', 'jpg', 1024,
        512, 1200, 1800, ${Buffer.alloc(32, 1)}, '#285078', ${NOW}, ${NOW},
        ${new Date('2026-09-01T00:00:00.000Z')})`;
      await transaction`insert into private.work_media_variants (
        asset_id, width, height, byte_size, content_hash, object_key
      ) values (${IDS.poster}, 480, 720, 256, ${Buffer.alloc(32, 2)},
        ${`media/${IDS.poster}/480.webp`})`;
      await transaction`insert into private.work_revision_media (
        revision_id, media_kind, position, asset_id
      ) values (${IDS.revisionOne}, 'poster', 1, ${IDS.poster})`;
      await transaction`insert into private.public_work_catalog (
        work_id, revision_id, work_public_id, title, summary, description, category,
        academic_year, semester, semester_order, published_at, normalized_title,
        normalized_summary, normalized_tags, normalized_attributions,
        normalized_description, normalized_search
      ) values
        (${IDS.workOne}, ${IDS.revisionOne}, ${IDS.workOnePublic}, 'React Catalog', 'ระบบค้นหา',
          'รายละเอียด', 'course_work', 2569, '1', 1, ${NOW}, 'react catalog', 'ระบบค้นหา',
          'react nestjs', 'ณัฐดนัย', 'รายละเอียด',
          'react catalog ระบบค้นหา react nestjs ณัฐดนัย รายละเอียด'),
        (${IDS.workTwo}, ${IDS.revisionTwo}, ${IDS.workTwoPublic}, 'API Catalog', 'ใช้ React',
          'รายละเอียด', 'academic_article', 2568, '2', 2, ${new Date(NOW.getTime() - 1_000)},
          'api catalog', 'ใช้ react', 'react', 'ณัฐดนัย', 'รายละเอียด',
          'api catalog ใช้ react react ณัฐดนัย รายละเอียด')`;
    });
  }

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.cache_invalidation_deliveries where event_id in (
        select id from private.outbox_events where aggregate_type = 'catalog_reconciliation'
      )`;
      await transaction`delete from private.outbox_events where aggregate_type = 'catalog_reconciliation'`;
      await transaction`delete from private.public_work_catalog where work_id in (${IDS.workOne}, ${IDS.workTwo})`;
      await transaction`delete from private.work_revision_media where revision_id in (${IDS.revisionOne}, ${IDS.revisionTwo})`;
      await transaction`delete from private.work_media_variants where asset_id = ${IDS.poster}`;
      await transaction`delete from private.work_media_assets where id = ${IDS.poster}`;
      await transaction`delete from private.published_revision_tags where revision_id in (${IDS.revisionOne}, ${IDS.revisionTwo})`;
      await transaction`delete from public.tags where id in (${IDS.tagReact}, ${IDS.tagNest}, ${IDS.tagZero})`;
      await transaction`delete from private.work_revision_attributions where revision_id in (${IDS.revisionOne}, ${IDS.revisionTwo})`;
      await transaction`delete from private.reviews where revision_id in (${IDS.revisionOne}, ${IDS.revisionTwo})`;
      await transaction`update public.works set published_revision_id = null where id in (${IDS.workOne}, ${IDS.workTwo})`;
      await transaction`delete from private.work_revisions where id in (${IDS.revisionOne}, ${IDS.revisionTwo})`;
      await transaction`delete from public.works where id in (${IDS.workOne}, ${IDS.workTwo})`;
      await transaction`delete from public.profile_consents where person_id in (
        ${IDS.consentedPerson}, ${IDS.secondConsentedPerson}, ${IDS.thirdConsentedPerson}
      )`;
      await transaction`delete from public.public_profiles where person_id in (
        ${IDS.consentedPerson}, ${IDS.hiddenPerson},
        ${IDS.secondConsentedPerson}, ${IDS.thirdConsentedPerson}
      )`;
      await transaction`delete from public.account_roles where account_id = ${IDS.adminAccount}`;
      await transaction`delete from public.accounts where id = ${IDS.adminAccount}`;
      await transaction`delete from public.students where person_id in (
        ${IDS.consentedPerson}, ${IDS.hiddenPerson},
        ${IDS.secondConsentedPerson}, ${IDS.thirdConsentedPerson}
      )`;
      await transaction`delete from public.people where id in (
        ${IDS.adminPerson}, ${IDS.consentedPerson}, ${IDS.hiddenPerson},
        ${IDS.secondConsentedPerson}, ${IDS.thirdConsentedPerson}
      )`;
    });
  }

  async function explain(query: postgres.PendingQuery<postgres.Row[]>): Promise<string> {
    const rows = await database.sql<Array<{ 'QUERY PLAN': string }>>`explain ${query}`;
    return rows.map((line) => line['QUERY PLAN']).join('\n');
  }
});

function id(index: number): string {
  return `97000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
