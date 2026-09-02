import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import { createSignedMediaUrl } from '../../../config/media-url';
import type {
  CatalogPosition,
  CatalogFilterOptions,
  CatalogRepository,
  CatalogSitemapEntry,
  CatalogSitemapKind,
  CatalogSlice,
  PeopleCatalogCard,
  PublicTagView,
  WorkCatalogCard,
} from '../application/catalog.ports';
import type { PeopleCatalogQuery, WorkCatalogQuery } from '../domain/catalog-query-policy';

interface WorkCatalogRow {
  academic_year: number;
  attributions: string[];
  category: WorkCatalogCard['category'];
  normalized_title: string;
  poster: WorkCatalogCard['poster'];
  published_at: Date;
  rank: number;
  semester: WorkCatalogCard['academicPeriod']['semester'];
  semester_order: number;
  summary: string;
  tags: WorkCatalogCard['tags'];
  title: string;
  work_public_id: string;
}

interface PeopleCatalogRow {
  bio: string | null;
  entry_year: number;
  first_name_th: string;
  last_name_th: string;
  normalized_name: string;
  photo_height: number | null;
  photo_object_key: string | null;
  photo_width: number | null;
  public_id: string;
  published_work_count: number;
  rank: number;
}

interface TagRow {
  active_work_count: number;
  display_label: string;
  public_id: string;
}

interface SitemapRow {
  last_modified: Date | null;
  public_id: string;
}

const MAX_SITEMAP_ENTRIES = 50_000;

@Injectable()
export class PostgresCatalogRepository implements CatalogRepository {
  private readonly publicMediaOrigin: string;
  private readonly mediaSigningSecret: string;

  constructor(
    private readonly database: DatabaseClient,
    config: ConfigService,
  ) {
    this.publicMediaOrigin = config.get<string>('PUBLIC_MEDIA_ORIGIN') ?? 'https://media.invalid';
    this.mediaSigningSecret = config.get<string>('MEDIA_SERVICE_HMAC_SECRET') ?? '';
  }

  async listWorks(input: {
    after: CatalogPosition | null;
    query: WorkCatalogQuery;
  }): Promise<CatalogSlice<WorkCatalogCard>> {
    const { after, query } = input;
    const pattern = query.query === null ? null : `%${escapeLike(query.query)}%`;
    const fetchLimit = query.limit + 1;
    const categories = query.categories;
    const tagPublicIds = query.tagPublicIds;
    let rows: WorkCatalogRow[];

    if (query.sort === 'title') {
      const afterTitle = positionString(after, 'title');
      const afterPublicId = positionString(after, 'publicId');
      rows = await this.database.sql<WorkCatalogRow[]>`
        ${this.workCandidates(pattern, categories, tagPublicIds, query)}
        select candidate.*,
          ${this.workAttributionsSql()}, ${this.workTagsSql()}, ${this.workPosterSql()}
        from candidate
        where (${after === null} or (candidate.normalized_title, candidate.work_public_id) >
          (${afterTitle}, ${afterPublicId}::uuid))
        order by candidate.normalized_title, candidate.work_public_id
        limit ${fetchLimit}
      `;
    } else if (query.sort === 'academic_period') {
      const afterYear = positionNumber(after, 'year');
      const afterSemester = positionNumber(after, 'semesterOrder');
      const afterPublishedAt = positionString(after, 'publishedAt');
      const afterPublicId = positionString(after, 'publicId');
      rows = await this.database.sql<WorkCatalogRow[]>`
        ${this.workCandidates(pattern, categories, tagPublicIds, query)}
        select candidate.*,
          ${this.workAttributionsSql()}, ${this.workTagsSql()}, ${this.workPosterSql()}
        from candidate
        where (${after === null} or (
          candidate.academic_year, candidate.semester_order,
          candidate.published_at, candidate.work_public_id
        ) < (${afterYear}, ${afterSemester}, ${afterPublishedAt}::timestamptz, ${afterPublicId}::uuid))
        order by candidate.academic_year desc, candidate.semester_order desc,
          candidate.published_at desc, candidate.work_public_id desc
        limit ${fetchLimit}
      `;
    } else if (query.sort === 'relevance') {
      const afterRank = positionNumber(after, 'rank');
      const afterPublishedAt = positionString(after, 'publishedAt');
      const afterPublicId = positionString(after, 'publicId');
      rows = await this.database.sql<WorkCatalogRow[]>`
        ${this.workCandidates(pattern, categories, tagPublicIds, query)}
        select candidate.*,
          ${this.workAttributionsSql()}, ${this.workTagsSql()}, ${this.workPosterSql()}
        from candidate
        where (${after === null} or (candidate.rank, candidate.published_at, candidate.work_public_id) <
          (${afterRank}, ${afterPublishedAt}::timestamptz, ${afterPublicId}::uuid))
        order by candidate.rank desc, candidate.published_at desc, candidate.work_public_id desc
        limit ${fetchLimit}
      `;
    } else {
      const afterPublishedAt = positionString(after, 'publishedAt');
      const afterPublicId = positionString(after, 'publicId');
      rows = await this.database.sql<WorkCatalogRow[]>`
        ${this.workCandidates(pattern, categories, tagPublicIds, query)}
        select candidate.*,
          ${this.workAttributionsSql()}, ${this.workTagsSql()}, ${this.workPosterSql()}
        from candidate
        where (${after === null} or (candidate.published_at, candidate.work_public_id) <
          (${afterPublishedAt}::timestamptz, ${afterPublicId}::uuid))
        order by candidate.published_at desc, candidate.work_public_id desc
        limit ${fetchLimit}
      `;
    }

    return {
      entries: rows.map((row) => ({
        item: this.mapWork(row),
        position: this.workPosition(row, query.sort),
      })),
    };
  }

  async getCacheVersion(): Promise<string> {
    const rows = await this.database.sql<Array<{ version: bigint }>>`
      select version from private.public_cache_version where singleton
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('PUBLIC_CACHE_VERSION_MISSING');
    return row.version.toString();
  }

  async listPeople(input: {
    after: CatalogPosition | null;
    query: PeopleCatalogQuery;
  }): Promise<CatalogSlice<PeopleCatalogCard>> {
    const { after, query } = input;
    const pattern = query.query === null ? null : `%${escapeLike(query.query)}%`;
    const fetchLimit = query.limit + 1;
    let rows: PeopleCatalogRow[];
    if (query.sort === 'relevance') {
      rows = await this.database.sql<PeopleCatalogRow[]>`
        ${this.peopleCandidates(pattern, query)}
        select * from candidate
        where (${after === null}
          or rank < ${positionNumber(after, 'rank')}
          or (rank = ${positionNumber(after, 'rank')}
            and (normalized_name, public_id) >
              (${positionString(after, 'name')}, ${positionString(after, 'publicId')}::uuid)))
        order by rank desc, normalized_name, public_id
        limit ${fetchLimit}
      `;
    } else {
      rows = await this.database.sql<PeopleCatalogRow[]>`
        ${this.peopleCandidates(pattern, query)}
        select * from candidate
        where (${after === null} or (normalized_name, public_id) >
          (${positionString(after, 'name')}, ${positionString(after, 'publicId')}::uuid))
        order by normalized_name, public_id
        limit ${fetchLimit}
      `;
    }
    return {
      entries: rows.map((row) => ({
        item: this.mapPerson(row),
        position: {
          name: row.normalized_name,
          publicId: row.public_id,
          ...(query.sort === 'relevance' ? { rank: row.rank } : {}),
        },
      })),
    };
  }

  async listPopularTags(): Promise<PublicTagView[]> {
    const rows = await this.database.sql<TagRow[]>`
      select public_id, display_label, active_work_count::integer as active_work_count
      from public.tags where active_work_count > 0
      order by active_work_count desc, lower(display_label), public_id
      limit 20
    `;
    return rows.map(mapTag);
  }

  async suggestTags(query: string): Promise<PublicTagView[]> {
    const prefix = `${escapeLike(query)}%`;
    const contains = `%${escapeLike(query)}%`;
    const rows = await this.database.sql<TagRow[]>`
      select public_id, display_label, active_work_count::integer as active_work_count
      from public.tags
      where active_work_count > 0
        and (
          normalized_identity like ${contains} escape '\\'
          or normalized_identity operator(extensions.%) ${query}
        )
      order by
        case
          when normalized_identity = ${query} then 0
          when normalized_identity like ${prefix} escape '\\' then 1
          when normalized_identity like ${contains} escape '\\' then 2
          else 3
        end,
        extensions.similarity(normalized_identity, ${query}) desc,
        active_work_count desc,
        lower(display_label),
        public_id
      limit 8
    `;
    return rows.map(mapTag);
  }

  async listFilterOptions(): Promise<CatalogFilterOptions> {
    const [workRows, entryRows] = await Promise.all([
      this.database.sql<Array<{ year: number }>>`
        select distinct academic_year as year
        from private.public_work_catalog
        order by year desc
      `,
      this.database.sql<Array<{ year: number }>>`
        select distinct student.entry_year as year
        from public.students as student
        join public.public_profiles as profile on profile.person_id = student.person_id
        join public.profile_consents as consent
          on consent.person_id = profile.person_id and consent.withdrawn_at is null
        order by year desc
      `,
    ]);
    return {
      entryYears: entryRows.map((row) => row.year),
      workYears: workRows.map((row) => row.year),
    };
  }

  async findTag(publicId: string): Promise<PublicTagView | null> {
    const rows = await this.database.sql<TagRow[]>`
      select public_id, display_label, active_work_count::integer as active_work_count
      from public.tags where public_id = ${publicId} and active_work_count > 0 limit 1
    `;
    return rows[0] === undefined ? null : mapTag(rows[0]);
  }

  async listSitemapEntries(
    kind: CatalogSitemapKind,
    bucket: number,
  ): Promise<CatalogSitemapEntry[]> {
    const { lower, upper } = sitemapRange(bucket);
    let rows: SitemapRow[];
    if (kind === 'works') {
      rows = await this.database.sql<SitemapRow[]>`
        select work_public_id as public_id, published_at as last_modified
        from private.public_work_catalog
        where work_public_id >= ${lower}::uuid
          and (${upper}::uuid is null or work_public_id < ${upper}::uuid)
        order by work_public_id
        limit ${MAX_SITEMAP_ENTRIES + 1}
      `;
    } else if (kind === 'people') {
      rows = await this.database.sql<SitemapRow[]>`
        select profile.public_id,
          greatest(profile.updated_at, consent.granted_at) as last_modified
        from public.public_profiles as profile
        join public.profile_consents as consent
          on consent.person_id = profile.person_id and consent.withdrawn_at is null
        where profile.public_id >= ${lower}::uuid
          and (${upper}::uuid is null or profile.public_id < ${upper}::uuid)
        order by profile.public_id
        limit ${MAX_SITEMAP_ENTRIES + 1}
      `;
    } else {
      rows = await this.database.sql<SitemapRow[]>`
        select public_id, null::timestamptz as last_modified
        from public.tags
        where active_work_count > 0 and public_id >= ${lower}::uuid
          and (${upper}::uuid is null or public_id < ${upper}::uuid)
        order by public_id
        limit ${MAX_SITEMAP_ENTRIES + 1}
      `;
    }
    if (rows.length > MAX_SITEMAP_ENTRIES) {
      throw new Error('CATALOG_SITEMAP_BUCKET_OVERFLOW');
    }
    return rows.map((row) => ({
      lastModified: row.last_modified?.toISOString() ?? null,
      publicId: row.public_id,
    }));
  }

  private workCandidates(
    pattern: string | null,
    categories: WorkCatalogQuery['categories'],
    tagPublicIds: string[],
    query: WorkCatalogQuery,
  ) {
    return this.database.sql`
      with candidate as (
        select catalog.*,
          (case when ${pattern}::text is not null and catalog.normalized_title like ${pattern} escape '\\' then 100000 else 0 end
          + case when ${pattern}::text is not null and catalog.normalized_summary like ${pattern} escape '\\' then 10000 else 0 end
          + case when ${pattern}::text is not null and catalog.normalized_tags like ${pattern} escape '\\' then 1000 else 0 end
          + case when ${pattern}::text is not null and catalog.normalized_attributions like ${pattern} escape '\\' then 100 else 0 end
          + case when ${pattern}::text is not null and catalog.normalized_description like ${pattern} escape '\\' then 10 else 0 end)::integer as rank
        from private.public_work_catalog as catalog
        where (${pattern}::text is null or catalog.normalized_search like ${pattern} escape '\\')
          and (${categories.length} = 0 or catalog.category = any(${categories}::text[]))
          and (${query.year}::integer is null or catalog.academic_year = ${query.year})
          and (${query.semester}::text is null or catalog.semester = ${query.semester})
          and (${query.profilePublicId}::uuid is null or exists (
            select 1
            from public.public_profiles as profile
            join public.profile_consents as consent
              on consent.person_id = profile.person_id and consent.withdrawn_at is null
            join private.work_revision_attributions as attribution
              on attribution.person_id = profile.person_id
            where profile.public_id = ${query.profilePublicId}
              and attribution.revision_id = catalog.revision_id
          ))
          and (${tagPublicIds.length} = 0 or (
            select count(distinct tag.public_id)::integer
            from private.published_revision_tags as published_tag
            join public.tags as tag on tag.id = published_tag.tag_id
            where published_tag.revision_id = catalog.revision_id
              and tag.public_id = any(${tagPublicIds}::uuid[])
          ) = ${tagPublicIds.length})
      )
    `;
  }

  private workAttributionsSql() {
    return this.database.sql`
      coalesce((
        select jsonb_agg(attribution.attribution_name order by attribution.position)
        from private.work_revision_attributions as attribution
        where attribution.revision_id = candidate.revision_id
      ), '[]'::jsonb) as attributions
    `;
  }

  private workTagsSql() {
    return this.database.sql`
      coalesce((
        select jsonb_agg(
          jsonb_build_object('displayLabel', tag.display_label, 'publicId', tag.public_id)
          order by published_tag.position
        )
        from private.published_revision_tags as published_tag
        join public.tags as tag on tag.id = published_tag.tag_id
        where published_tag.revision_id = candidate.revision_id
      ), '[]'::jsonb) as tags
    `;
  }

  private workPosterSql() {
    return this.database.sql`
      (
        select jsonb_build_object(
          'assetId', asset.id, 'dominantColor', asset.dominant_color,
          'width', asset.width, 'height', asset.height,
          'variants', coalesce((
            select jsonb_agg(
              jsonb_build_object('width', variant.width, 'height', variant.height)
              order by variant.width
            ) from private.work_media_variants as variant where variant.asset_id = asset.id
          ), '[]'::jsonb)
        )
        from private.work_revision_media as media
        join private.work_media_assets as asset on asset.id = media.asset_id and asset.status = 'ready'
        where media.revision_id = candidate.revision_id and media.media_kind = 'poster'
        limit 1
      ) as poster
    `;
  }

  private peopleCandidates(pattern: string | null, query: PeopleCatalogQuery) {
    return this.database.sql`
      with profile_source as (
        select profile.person_id, profile.public_id, profile.bio,
          name.first_name_th, name.last_name_th,
          lower(regexp_replace(
            normalize(btrim(name.first_name_th || ' ' || name.last_name_th), NFKC),
            '[[:space:]]+', ' ', 'g'
          )) as normalized_name,
          student.entry_year, photo.sanitized_object_key as photo_object_key,
          photo.width as photo_width, photo.height as photo_height,
          photo.id as photo_id
        from public.public_profiles as profile
        join public.students as student on student.person_id = profile.person_id
        join private.person_names as name on name.person_id = profile.person_id
        join public.profile_consents as consent
          on consent.person_id = profile.person_id and consent.withdrawn_at is null
        left join private.profile_photo_assets as photo
          on photo.id = profile.photo_id and photo.status = 'ready'
      ), candidate as (
        select source.public_id, source.bio, source.first_name_th, source.last_name_th,
          source.normalized_name, source.entry_year, source.photo_object_key,
          source.photo_width, source.photo_height,
          (select count(distinct catalog.work_id)::integer
            from private.public_work_catalog as catalog
            join private.work_revision_attributions as attribution
              on attribution.revision_id = catalog.revision_id
            where attribution.person_id = source.person_id) as published_work_count,
          case when ${pattern}::text is null then 0
            when source.normalized_name = ${query.query} then 2 else 1 end as rank
        from profile_source as source
        where (${pattern}::text is null or source.normalized_name like ${pattern} escape '\\')
          and (${query.entryYear}::integer is null or source.entry_year = ${query.entryYear})
      )
    `;
  }

  private mapWork(row: WorkCatalogRow): WorkCatalogCard {
    return {
      academicPeriod: { semester: row.semester, year: row.academic_year },
      attributions: row.attributions,
      category: row.category,
      poster: row.poster,
      publishedAt: row.published_at.toISOString(),
      summary: row.summary,
      tags: row.tags,
      title: row.title,
      workPublicId: row.work_public_id,
    };
  }

  private workPosition(row: WorkCatalogRow, sort: WorkCatalogQuery['sort']): CatalogPosition {
    const common = { publicId: row.work_public_id };
    if (sort === 'title') return { ...common, title: row.normalized_title };
    if (sort === 'academic_period') {
      return {
        ...common,
        publishedAt: row.published_at.toISOString(),
        semesterOrder: row.semester_order,
        year: row.academic_year,
      };
    }
    return {
      ...common,
      publishedAt: row.published_at.toISOString(),
      ...(sort === 'relevance' ? { rank: row.rank } : {}),
    };
  }

  private mapPerson(row: PeopleCatalogRow): PeopleCatalogCard {
    return {
      bio: row.bio,
      entryYear: row.entry_year,
      firstName: row.first_name_th,
      lastName: row.last_name_th,
      photo:
        row.photo_object_key === null || row.photo_width === null || row.photo_height === null
          ? null
          : {
              height: row.photo_height,
              url: createSignedMediaUrl(
                this.publicMediaOrigin,
                this.mediaSigningSecret,
                row.photo_object_key,
                300,
              ),
              width: row.photo_width,
            },
      publicId: row.public_id,
      publishedWorkCount: row.published_work_count,
    };
  }
}

function mapTag(row: TagRow): PublicTagView {
  return {
    activeWorkCount: row.active_work_count,
    displayLabel: row.display_label,
    publicId: row.public_id,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function positionString(position: CatalogPosition | null, key: string): string | null {
  const value = position?.[key];
  return typeof value === 'string' ? value : null;
}

function positionNumber(position: CatalogPosition | null, key: string): number | null {
  const value = position?.[key];
  return typeof value === 'number' ? value : null;
}

function sitemapRange(bucket: number): { lower: string; upper: string | null } {
  const prefix = bucket.toString(16).padStart(2, '0');
  const lower = `${prefix}000000-0000-0000-0000-000000000000`;
  if (bucket === 255) return { lower, upper: null };
  const upperPrefix = (bucket + 1).toString(16).padStart(2, '0');
  return { lower, upper: `${upperPrefix}000000-0000-0000-0000-000000000000` };
}
