import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  PublicationRepository,
  PublicationResult,
  PublicationView,
  PublicWorkAttributionView,
  PublicWorkMediaView,
  PublicWorkView,
} from '../application/publication.ports';
import type { NormalizedWorkDraft } from '../domain/work-draft-policy';
import { refreshPublicWorkCatalog } from '../../catalog/infrastructure/postgres-catalog-projection';

type Sql = postgres.Sql;

interface LockedPublicationRow {
  activity_state: 'active' | 'archived';
  base_published_revision_id: string | null;
  id: string;
  publication_state: 'never_published' | 'published' | 'unpublished';
  published_revision_id: string | null;
  revision_number: string;
  revision_public_id: string;
  revision_status: 'approved' | 'changes_requested' | 'pending_review' | 'withdrawn';
  revision_version: string;
  work_id: string;
  work_public_id: string;
}

interface PublicationRow {
  published_at: Date;
  revision_public_id: string;
  revision_version: string;
  work_public_id: string;
}

interface PublicWorkRow {
  academic_year: number;
  attributions: PublicWorkAttributionView[];
  category: NormalizedWorkDraft['category'];
  description: string;
  links: NormalizedWorkDraft['links'];
  media: PublicWorkMediaView[];
  published_at: Date;
  revision_number: string;
  semester: NormalizedWorkDraft['academicPeriod']['semester'];
  summary: string;
  tags: PublicWorkView['tags'];
  title: string;
  video_links: NormalizedWorkDraft['videoLinks'];
  work_public_id: string;
}

type ReplayResolution =
  { outcome: 'conflict' } | { outcome: 'none' } | { outcome: 'replay'; reviewId: string };

@Injectable()
export class PostgresPublicationRepository implements PublicationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async approveAndPublish(
    input: Parameters<PublicationRepository['approveAndPublish']>[0],
  ): Promise<PublicationResult> {
    const payload: postgres.JSONValue = {
      expectedRevisionVersion: input.expectedRevisionVersion,
      revisionPublicId: input.revisionPublicId,
    };
    try {
      return await this.database.sql.begin(async (transaction) => {
        const initialReplay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          payload,
        );
        const initialResult = await this.toReplayResult(transaction, initialReplay);
        if (initialResult !== null) return initialResult;

        const rows = await transaction<LockedPublicationRow[]>`
          select revision.id, revision.public_id as revision_public_id, revision.revision_number,
            revision.status as revision_status, revision.version as revision_version,
            revision.base_published_revision_id,
            work.id as work_id, work.public_id as work_public_id, work.activity_state,
            work.publication_state, work.published_revision_id
          from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where revision.public_id = ${input.revisionPublicId}
          for update of revision, work
        `;
        const candidate = rows[0];
        if (candidate === undefined) return { outcome: 'revision_not_found' };

        const concurrentReplay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          payload,
        );
        const concurrentResult = await this.toReplayResult(transaction, concurrentReplay);
        if (concurrentResult !== null) return concurrentResult;
        if (candidate.revision_status !== 'pending_review') {
          return { outcome: 'revision_state_conflict' };
        }
        if (Number(candidate.revision_version) !== input.expectedRevisionVersion) {
          return { outcome: 'revision_version_conflict' };
        }
        if (candidate.activity_state !== 'active') return { outcome: 'work_state_conflict' };
        const isFirstPublication =
          candidate.publication_state === 'never_published' &&
          candidate.published_revision_id === null &&
          candidate.base_published_revision_id === null;
        const isNewerPublication =
          Number(candidate.revision_number) > 1 &&
          candidate.publication_state !== 'never_published' &&
          candidate.published_revision_id !== null &&
          candidate.base_published_revision_id === candidate.published_revision_id;
        if (!isFirstPublication && !isNewerPublication) {
          return { outcome: 'work_state_conflict' };
        }

        const inserted = await transaction<Array<{ id: string }>>`
          insert into private.reviews (
            revision_id, actor_account_id, decision, reason, feedback,
            expected_revision_version, resulting_revision_version, idempotency_key,
            request_payload, reviewed_at
          ) values (
            ${candidate.id}, ${input.actorAccountId}, 'approved', null, null,
            ${input.expectedRevisionVersion}, ${input.expectedRevisionVersion + 1},
            ${input.idempotencyKey}, ${transaction.json(payload)}, ${input.now}
          ) returning id
        `;
        const reviewId = this.required(inserted[0]).id;
        await transaction`
          update private.work_revisions
          set status = 'approved', version = version + 1
          where id = ${candidate.id}
        `;
        await transaction`
          update public.works
          set published_revision_id = ${candidate.id}, publication_state = 'published',
            version = version + 1, updated_at = ${input.now}
          where id = ${candidate.work_id}
        `;
        await transaction`
          update private.work_drafts
          set lifecycle_state = 'retained', updated_at = ${input.now}
          where work_id = ${candidate.work_id}
            and lifecycle_state = 'active'
            and version = (
              select draft_version from private.work_revisions
              where id = ${candidate.id} and author_kind = 'student_submission'
            )
        `;
        await this.replacePublishedTags(
          transaction,
          candidate.id,
          candidate.publication_state === 'published' ? candidate.published_revision_id : null,
          input.now,
        );
        await refreshPublicWorkCatalog(transaction, candidate.work_id, input.now);
        await this.recordPublicationEvent(transaction, candidate, input.now);
        const publication = await this.findPublicationByReviewId(transaction, reviewId);
        if (publication === null) throw new Error('PUBLICATION_CREATE_READ_FAILED');
        return { outcome: 'published', publication };
      });
    } catch (error: unknown) {
      if (!this.isIdempotencyConflict(error)) throw error;
      const replay = await this.resolveReplay(
        this.database.sql,
        input.actorAccountId,
        input.idempotencyKey,
        payload,
      );
      return (
        (await this.toReplayResult(this.database.sql, replay)) ?? {
          outcome: 'idempotency_conflict',
        }
      );
    }
  }

  async findPublicWork(workPublicId: string): Promise<PublicWorkView | null> {
    const rows = await this.database.sql<PublicWorkRow[]>`
      select work.public_id as work_public_id, revision.revision_number,
        revision.title, revision.summary, revision.description, revision.category,
        revision.academic_year, revision.semester, review.reviewed_at as published_at,
        coalesce((
          select jsonb_agg(
            jsonb_build_object('label', link.label, 'url', link.url)
            order by link.position
          )
          from private.work_revision_links as link
          where link.revision_id = revision.id
        ), '[]'::jsonb) as links,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'provider', video.provider,
              'providerVideoId', video.provider_video_id,
              'url', video.url
            ) order by video.position
          )
          from private.work_revision_video_links as video
          where video.revision_id = revision.id
        ), '[]'::jsonb) as video_links,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'attributionPublicId', attribution.attribution_public_id,
              'attributionName', attribution.attribution_name,
              'canRequestRemoval', attribution.kind <> 'submitter',
              'studyYear', attribution.study_year,
              'contributionRole', attribution.contribution_role,
              'affiliation', attribution.affiliation,
              'profilePublicId', case when consent.id is null then null else profile.public_id end,
              'hasPhoto', case when consent.id is null then false else photo.id is not null end
            ) order by attribution.position
          )
          from private.work_revision_attributions as attribution
          left join public.public_profiles as profile on profile.person_id = attribution.person_id
          left join public.profile_consents as consent
            on consent.person_id = profile.person_id and consent.withdrawn_at is null
          left join private.profile_photo_assets as photo
            on photo.id = profile.photo_id and photo.status = 'ready'
          where attribution.revision_id = revision.id
        ), '[]'::jsonb) as attributions,
        coalesce((
          select jsonb_agg(
            jsonb_build_object('displayLabel', tag.display_label, 'publicId', tag.public_id)
            order by published_tag.position
          )
          from private.published_revision_tags as published_tag
          join public.tags as tag on tag.id = published_tag.tag_id
          where published_tag.revision_id = revision.id
        ), '[]'::jsonb) as tags,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'assetId', asset.id,
              'kind', media.media_kind,
              'position', media.position,
              'dominantColor', asset.dominant_color,
              'width', asset.width,
              'height', asset.height,
              'variants', coalesce((
                select jsonb_agg(
                  jsonb_build_object('width', variant.width, 'height', variant.height)
                  order by variant.width
                )
                from private.work_media_variants as variant
                where variant.asset_id = asset.id
              ), '[]'::jsonb)
            ) order by media.media_kind desc, media.position
          )
          from private.work_revision_media as media
          join private.work_media_assets as asset
            on asset.id = media.asset_id and asset.status = 'ready'
          where media.revision_id = revision.id
        ), '[]'::jsonb) as media
      from public.works as work
      join private.work_revisions as revision on revision.id = work.published_revision_id
      join private.reviews as review
        on review.revision_id = revision.id and review.decision = 'approved'
      where work.public_id = ${workPublicId}
        and work.activity_state = 'active'
        and work.publication_state = 'published'
        and revision.status = 'approved'
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          academicPeriod: { semester: row.semester, year: row.academic_year },
          attributions: row.attributions,
          category: row.category,
          description: row.description,
          links: row.links,
          media: row.media,
          publishedAt: row.published_at.toISOString(),
          revisionNumber: Number(row.revision_number),
          summary: row.summary,
          tags: row.tags,
          title: row.title,
          videoLinks: row.video_links,
          workPublicId: row.work_public_id,
        };
  }

  async findPublicMediaObjectKey(
    workPublicId: string,
    assetId: string,
    width: number,
  ): Promise<string | null> {
    const rows = await this.database.sql<Array<{ object_key: string }>>`
      select variant.object_key
      from public.works as work
      join private.work_revisions as revision on revision.id = work.published_revision_id
      join private.work_revision_media as media on media.revision_id = revision.id
      join private.work_media_assets as asset
        on asset.id = media.asset_id and asset.status = 'ready'
      join private.work_media_variants as variant
        on variant.asset_id = asset.id and variant.width = ${width}
      where work.public_id = ${workPublicId}
        and work.activity_state = 'active'
        and work.publication_state = 'published'
        and revision.status = 'approved'
        and asset.id = ${assetId}
      limit 1
    `;
    return rows[0]?.object_key ?? null;
  }

  private async replacePublishedTags(
    transaction: postgres.TransactionSql,
    revisionId: string,
    previousRevisionId: string | null,
    now: Date,
  ): Promise<void> {
    await transaction`
      insert into public.tags (
        normalized_identity, display_label, activated_at, active_work_count
      ) select normalized_identity, display_label, ${now}, 0
      from private.work_revision_tags
      where revision_id = ${revisionId}
      order by normalized_identity
      on conflict (normalized_identity) do nothing
    `;
    await transaction`
      insert into private.published_revision_tags (revision_id, tag_id, position)
      select revision_tag.revision_id, tag.id, revision_tag.position
      from private.work_revision_tags as revision_tag
      join public.tags as tag on tag.normalized_identity = revision_tag.normalized_identity
      where revision_tag.revision_id = ${revisionId}
    `;
    await transaction<Array<{ id: string }>>`
      select tag.id
      from public.tags as tag
      where exists (
        select 1 from private.published_revision_tags as published_tag
        where published_tag.tag_id = tag.id
          and published_tag.revision_id in (${revisionId}, ${previousRevisionId})
      )
      order by tag.id
      for update
    `;
    await transaction`
      update public.tags as tag
      set active_work_count = active_work_count - 1
      where ${previousRevisionId}::uuid is not null
        and exists (
          select 1 from private.published_revision_tags as published_tag
          where published_tag.revision_id = ${previousRevisionId}
            and published_tag.tag_id = tag.id
        )
    `;
    await transaction`
      update public.tags as tag
      set active_work_count = active_work_count + 1
      where exists (
        select 1 from private.published_revision_tags as published_tag
        where published_tag.revision_id = ${revisionId} and published_tag.tag_id = tag.id
      )
    `;
  }

  private async recordPublicationEvent(
    transaction: postgres.TransactionSql,
    candidate: LockedPublicationRow,
    now: Date,
  ): Promise<void> {
    const tags = await transaction<Array<{ public_id: string }>>`
      select distinct tag.public_id
      from private.published_revision_tags as published_tag
      join public.tags as tag on tag.id = published_tag.tag_id
      where published_tag.revision_id in (${candidate.id}, ${candidate.published_revision_id})
      order by tag.public_id
    `;
    const media = await transaction<Array<{ asset_id: string }>>`
      select distinct asset_id from private.work_revision_media
      where revision_id in (${candidate.id}, ${candidate.published_revision_id})
      order by asset_id
    `;
    await transaction`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'work_revision', ${candidate.revision_public_id},
        'work_revision_published',
        ${transaction.json({
          cacheTargets: {
            mediaAssetIds: media.map((asset) => asset.asset_id),
            tagPublicIds: tags.map((tag) => tag.public_id),
            workPublicId: candidate.work_public_id,
          },
        })},
        ${now}
      )
    `;
  }

  private async resolveReplay(
    sql: Sql,
    actorAccountId: string,
    idempotencyKey: string,
    payload: postgres.JSONValue,
  ): Promise<ReplayResolution> {
    const rows = await sql<Array<{ id: string; is_equivalent: boolean }>>`
      select id, (
        actor_account_id = ${actorAccountId}
        and decision = 'approved'
        and request_payload = ${sql.json(payload)}
      ) as is_equivalent
      from private.reviews where idempotency_key = ${idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return { outcome: 'none' };
    return row.is_equivalent ? { outcome: 'replay', reviewId: row.id } : { outcome: 'conflict' };
  }

  private async toReplayResult(
    sql: Sql,
    replay: ReplayResolution,
  ): Promise<PublicationResult | null> {
    if (replay.outcome === 'none') return null;
    if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
    const publication = await this.findPublicationByReviewId(sql, replay.reviewId);
    return publication === null
      ? { outcome: 'revision_not_found' }
      : { outcome: 'replayed', publication };
  }

  private async findPublicationByReviewId(
    sql: Sql,
    reviewId: string,
  ): Promise<PublicationView | null> {
    const rows = await sql<PublicationRow[]>`
      select review.reviewed_at as published_at,
        revision.public_id as revision_public_id,
        revision.version as revision_version,
        work.public_id as work_public_id
      from private.reviews as review
      join private.work_revisions as revision on revision.id = review.revision_id
      join public.works as work on work.id = revision.work_id
      where review.id = ${reviewId} and review.decision = 'approved'
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          publishedAt: row.published_at.toISOString(),
          revisionPublicId: row.revision_public_id,
          revisionVersion: Number(row.revision_version),
          workPublicId: row.work_public_id,
        };
  }

  private isIdempotencyConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505' &&
      'constraint_name' in error &&
      error.constraint_name === 'reviews_idempotency_key_key'
    );
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('PUBLICATION_PERSISTENCE_INVARIANT');
    return value;
  }
}
