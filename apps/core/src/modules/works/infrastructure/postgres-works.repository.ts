import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  WorkAuthoringContext,
  WorkAuthoringState,
  WorkDraftView,
  WorkListItem,
  WorkMutationResult,
  StudentWorkspaceSummary,
  WorksRepository,
} from '../application/works.ports';
import type { NormalizedWorkDraft, NormalizedWorkDraftPatch } from '../domain/work-draft-policy';
import { evaluateSubmitterSavedDraftTransition } from '../domain/work-recovery-policy';

type WorkOperation =
  'published_work_draft_seeded' | 'work_created' | 'work_draft_rebased' | 'work_draft_updated';

interface WorkRow {
  academic_year: number | null;
  activity_state: 'active';
  base_published_revision_id: string | null;
  category: NormalizedWorkDraft['category'] | null;
  contributors: WorkDraftView['contributors'];
  description: string | null;
  draft_links: NormalizedWorkDraft['links'];
  draft_tags: NormalizedWorkDraft['tags'];
  draft_video_links: NonNullable<NormalizedWorkDraft['videoLinks']>;
  has_ready_poster: boolean;
  media: WorkDraftView['media'];
  publication_state: WorkDraftView['publicationState'];
  published_revision_id: string | null;
  public_id: string;
  saved_at: Date;
  semester: NormalizedWorkDraft['academicPeriod']['semester'] | null;
  submitter_attribution_name: string | null;
  submitter_study_year: number | null;
  summary: string | null;
  title: string | null;
  version: string;
  work_id: string;
}

interface OwnedWorkRow {
  version: string;
  work_id: string;
}

interface OwnedWorkStateRow {
  activity_state: 'active';
  publication_state: WorkDraftView['publicationState'];
  published_revision_id: string | null;
  public_id: string;
  work_id: string;
}

interface WorkListRow {
  activity_state: WorkListItem['activityState'];
  archive_source: 'admin' | 'submitter' | null;
  academic_year: number | null;
  category: WorkListItem['category'];
  displayed_source: WorkListItem['displayedSource'];
  has_draft: boolean;
  is_draft_complete: boolean;
  latest_revision_status: WorkListItem['latestRevisionStatus'];
  poster: WorkListItem['poster'];
  publication_state: WorkListItem['publicationState'];
  public_id: string;
  semester: NormalizedWorkDraft['academicPeriod']['semester'] | null;
  summary: string | null;
  title: string | null;
  updated_at: Date;
  version: string;
}

interface WorkListTotalRow {
  total_items: number;
}

interface OperationRow {
  is_equivalent: boolean;
  work_id: string;
}

type ReplayResolution =
  { outcome: 'conflict' } | { outcome: 'none' } | { outcome: 'replay'; workId: string };

function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

@Injectable()
export class PostgresWorksRepository implements WorksRepository {
  constructor(private readonly database: DatabaseClient) {}

  archiveSavedDraft(
    input: Parameters<WorksRepository['archiveSavedDraft']>[0],
  ): ReturnType<WorksRepository['archiveSavedDraft']> {
    return this.savedDraftMutation(input, 'archive_saved_draft');
  }

  restoreSavedDraft(
    input: Parameters<WorksRepository['restoreSavedDraft']>[0],
  ): ReturnType<WorksRepository['restoreSavedDraft']> {
    return this.savedDraftMutation(input, 'restore_saved_draft');
  }

  async findAuthoringContext(accountId: string): Promise<WorkAuthoringContext | null> {
    const rows = await this.database.sql<
      Array<{
        current_academic_year: number | null;
        entry_year: number;
        person_id: string;
      }>
    >`
      select
        settings.current_academic_year,
        student.entry_year,
        account.person_id
      from public.accounts as account
      join public.students as student on student.person_id = account.person_id
      join public.account_roles as student_role
        on student_role.account_id = account.id and student_role.role = 'student'
      left join public.academic_settings as settings on settings.singleton = true
      where account.id = ${accountId}
        and account.status = 'active'
        and account.credential_state = 'set'
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          currentAcademicYear: row.current_academic_year,
          entryYear: row.entry_year,
          personId: row.person_id,
        };
  }

  async createWork(
    input: Parameters<WorksRepository['createWork']>[0],
  ): Promise<WorkMutationResult> {
    const patch: NormalizedWorkDraftPatch = input.patch ?? input.draft;
    const requestPayload = this.createRequestPayload(patch);
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'work_created',
          requestPayload,
        );
        const replayResult = await this.toReplayResult(transaction, input.actorAccountId, replay);
        if (replayResult !== null) return replayResult;

        const inserted = await transaction<Array<{ public_id: string; work_id: string }>>`
          insert into public.works (
            submitter_person_id,
            activity_state,
            publication_state,
            created_at,
            updated_at
          )
          select
            ${input.submitterPersonId},
            'active',
            'never_published',
            ${input.now},
            ${input.now}
          from public.accounts as account
          where account.id = ${input.actorAccountId}
            and account.person_id = ${input.submitterPersonId}
          returning id as work_id, public_id
        `;
        const work = inserted[0];
        if (work === undefined) return { outcome: 'not_found' };

        await this.insertDraft(transaction, work.work_id, patch, input.now, 1);
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'work_created',
          requestPayload,
          resultingVersion: 1,
          workId: work.work_id,
        });
        const created = await this.findOwnedDraftByWorkId(
          transaction,
          input.actorAccountId,
          work.work_id,
        );
        if (created === null) throw new Error('WORK_CREATE_READ_FAILED');
        return { outcome: 'created', work: created };
      });
    } catch (error: unknown) {
      return this.resolveConcurrentReplay(error, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        operation: 'work_created',
        requestPayload,
      });
    }
  }

  findOwnedDraft(accountId: string, publicId: string): Promise<WorkDraftView | null> {
    return this.findOneOwnedDraft(this.database.sql, accountId, 'public_id', publicId);
  }

  async findOwnedWorkState(
    accountId: string,
    publicId: string,
  ): Promise<WorkAuthoringState | null> {
    const rows = await this.database.sql<OwnedWorkStateRow[]>`
      select work.id as work_id, work.public_id, work.activity_state,
        work.publication_state, work.published_revision_id
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      where account.id = ${accountId} and work.public_id = ${publicId}
        and work.activity_state = 'active'
      limit 1
    `;
    const work = rows[0];
    if (work === undefined) return null;
    return {
      activityState: work.activity_state,
      draft: await this.findOwnedDraftByWorkId(this.database.sql, accountId, work.work_id),
      publicationState: work.publication_state,
      publishedRevisionId: work.published_revision_id,
      publicId: work.public_id,
    };
  }

  async listOwnedWorks(input: Parameters<WorksRepository['listOwnedWorks']>[0]) {
    const cursor = input.cursor;
    const isPrevious = cursor?.direction === 'previous';
    const isDescending = input.sort === 'updated_desc';
    const isQueryDescending = isPrevious ? !isDescending : isDescending;
    const searchPattern = `%${escapeLikePattern(input.query)}%`;
    const totalRows = await this.database.sql<WorkListTotalRow[]>`
      select count(*)::integer as total_items
      from public.works as work
      join public.accounts as account
        on account.id = ${input.accountId}
        and account.person_id = work.submitter_person_id
      left join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      left join private.work_revisions as pending_revision
        on pending_revision.work_id = work.id and pending_revision.status = 'pending_review'
      left join private.work_revisions as published_revision
        on published_revision.id = work.published_revision_id
      left join lateral (
        select revision.status
        from private.work_revisions as revision
        where revision.work_id = work.id
        order by revision.revision_number desc
        limit 1
      ) as latest_revision on true
      where (
        (${input.view} = 'current' and (
          work.activity_state = 'active'
          or (work.activity_state = 'archived' and work.archive_source = 'admin')
        ))
        or (${input.view} = 'saved' and work.activity_state = 'archived'
          and work.archive_source = 'submitter'
          and work.publication_state = 'never_published')
      )
      and (
        ${input.query} = ''
        or coalesce(draft.title, pending_revision.title, published_revision.title, '')
          ilike ${searchPattern} escape '\'
        or coalesce(draft.summary, pending_revision.summary, published_revision.summary, '')
          ilike ${searchPattern} escape '\'
      )
      and (
        ${input.category} = 'all'
        or coalesce(draft.category, pending_revision.category, published_revision.category)::text
          = ${input.category}
      )
      and (
        ${input.status} = 'all'
        or (${input.status} = 'draft' and draft.work_id is not null)
        or (${input.status} = 'pending_review' and latest_revision.status = 'pending_review')
        or (${input.status} = 'changes_requested' and latest_revision.status = 'changes_requested')
        or (${input.status} = 'published' and work.publication_state = 'published')
      )
    `;
    const totalItems = Number(totalRows[0]?.total_items ?? 0);
    const totalPages = Math.ceil(totalItems / input.limit);
    const currentPage = totalPages === 0 ? 1 : Math.min(input.page, totalPages);
    const pageOffset = cursor === null ? (currentPage - 1) * input.limit : 0;
    const rows = await this.database.sql<WorkListRow[]>`
      select work.public_id, work.activity_state, work.archive_source, work.publication_state, work.updated_at,
        work.version,
        (draft.work_id is not null) as has_draft,
        latest_revision.status as latest_revision_status,
        case
          when draft.work_id is not null then 'draft'
          when pending_revision.id is not null then 'pending_revision'
          when published_revision.id is not null then 'published_revision'
          else 'placeholder'
        end as displayed_source,
        coalesce(draft.title, pending_revision.title, published_revision.title) as title,
        coalesce(draft.summary, pending_revision.summary, published_revision.summary) as summary,
        coalesce(draft.category, pending_revision.category, published_revision.category) as category,
        coalesce(draft.academic_year, pending_revision.academic_year, published_revision.academic_year)
          as academic_year,
        coalesce(draft.semester, pending_revision.semester, published_revision.semester) as semester,
        private_poster.poster,
        case when draft.work_id is null then false else (
          draft.title is not null and draft.summary is not null and draft.description is not null
          and draft.category is not null and draft.academic_year is not null
          and draft.semester is not null and draft.submitter_study_year is not null
          and exists (
            select 1 from public.public_profiles as profile
            where profile.person_id = work.submitter_person_id
          )
          and exists (
            select 1 from private.work_draft_media as poster_reference
            join private.work_media_assets as poster on poster.id = poster_reference.asset_id
            where poster_reference.work_id = work.id
              and poster_reference.media_kind = 'poster' and poster.status = 'ready'
          )
          and not exists (
            select 1 from private.work_draft_contributors as contributor
            where contributor.work_id = work.id and contributor.removed_at is null
              and contributor.contribution_role is null
          )
        ) end as is_draft_complete
      from public.works as work
      join public.accounts as account
        on account.id = ${input.accountId}
        and account.person_id = work.submitter_person_id
      left join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      left join private.work_revisions as pending_revision
        on pending_revision.work_id = work.id and pending_revision.status = 'pending_review'
      left join private.work_revisions as published_revision
        on published_revision.id = work.published_revision_id
      left join lateral (
        select jsonb_build_object(
          'assetId', asset.id,
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
        ) as poster
        from (
          select reference.asset_id, 1 as priority
          from private.work_draft_media as reference
          where draft.work_id is not null and reference.work_id = work.id
            and reference.media_kind = 'poster'
          union all
          select reference.asset_id, 2 as priority
          from private.work_revision_media as reference
          where draft.work_id is null and pending_revision.id is not null
            and reference.revision_id = pending_revision.id and reference.media_kind = 'poster'
          union all
          select reference.asset_id, 3 as priority
          from private.work_revision_media as reference
          where draft.work_id is null and pending_revision.id is null
            and published_revision.id is not null
            and reference.revision_id = published_revision.id and reference.media_kind = 'poster'
        ) as source
        join private.work_media_assets as asset on asset.id = source.asset_id and asset.status = 'ready'
        order by source.priority
        limit 1
      ) as private_poster on true
      left join lateral (
        select revision.status
        from private.work_revisions as revision
        where revision.work_id = work.id
        order by revision.revision_number desc
        limit 1
      ) as latest_revision on true
      where (
        (${input.view} = 'current' and (
          work.activity_state = 'active'
          or (work.activity_state = 'archived' and work.archive_source = 'admin')
        ))
        or (${input.view} = 'saved' and work.activity_state = 'archived'
          and work.archive_source = 'submitter'
          and work.publication_state = 'never_published')
      )
      and (
        ${input.query} = ''
        or coalesce(draft.title, pending_revision.title, published_revision.title, '')
          ilike ${searchPattern} escape '\'
        or coalesce(draft.summary, pending_revision.summary, published_revision.summary, '')
          ilike ${searchPattern} escape '\'
      )
      and (
        ${input.category} = 'all'
        or coalesce(draft.category, pending_revision.category, published_revision.category)::text
          = ${input.category}
      )
      and (
        ${input.status} = 'all'
        or (${input.status} = 'draft' and draft.work_id is not null)
        or (${input.status} = 'pending_review' and latest_revision.status = 'pending_review')
        or (${input.status} = 'changes_requested' and latest_revision.status = 'changes_requested')
        or (${input.status} = 'published' and work.publication_state = 'published')
      )
      and (
        ${cursor?.updatedAt ?? null}::timestamptz is null
        or (${isQueryDescending} and (work.updated_at, work.public_id) < (
          ${cursor?.updatedAt ?? null}::timestamptz, ${cursor?.publicId ?? null}::uuid
        ))
        or (not ${isQueryDescending} and (work.updated_at, work.public_id) > (
          ${cursor?.updatedAt ?? null}::timestamptz, ${cursor?.publicId ?? null}::uuid
        ))
      )
      order by
        case when ${isQueryDescending} then work.updated_at end desc,
        case when ${isQueryDescending} then work.public_id end desc,
        case when not ${isQueryDescending} then work.updated_at end asc,
        case when not ${isQueryDescending} then work.public_id end asc
      limit ${input.limit + 1}
      offset ${pageOffset}
    `;
    const visible = rows.slice(0, input.limit);
    if (isPrevious) visible.reverse();
    const first = visible[0];
    const last = visible.at(-1);
    const hasNextPage =
      cursor === null ? currentPage < totalPages : isPrevious ? true : rows.length > input.limit;
    const hasPreviousPage =
      cursor === null ? currentPage > 1 : isPrevious ? rows.length > input.limit : true;
    return {
      currentPage,
      items: visible.map((row) => ({
        activityState: row.activity_state,
        academicPeriod:
          row.academic_year === null || row.semester === null
            ? null
            : { semester: row.semester, year: row.academic_year },
        category: row.category,
        displayedSource: row.displayed_source,
        hasDraft: row.has_draft,
        isDraftComplete: row.is_draft_complete,
        latestRevisionStatus: row.latest_revision_status,
        poster: row.poster,
        primaryAction: this.primaryAction(row),
        publicationState: row.publication_state,
        publicId: row.public_id,
        secondaryActions: this.secondaryActions(row),
        summary: row.summary,
        title: row.title,
        updatedAt: row.updated_at,
        version: Number(row.version),
      })),
      hasNextPage,
      hasPreviousPage,
      nextCursor:
        hasNextPage && last !== undefined
          ? { direction: 'next' as const, publicId: last.public_id, updatedAt: last.updated_at }
          : null,
      pageSize: input.limit,
      previousCursor:
        hasPreviousPage && first !== undefined
          ? {
              direction: 'previous' as const,
              publicId: first.public_id,
              updatedAt: first.updated_at,
            }
          : null,
      totalItems,
      totalPages,
    };
  }

  async getWorkspaceSummary(accountId: string): Promise<StudentWorkspaceSummary | null> {
    const rows = await this.database.sql<
      Array<StudentWorkspaceSummary & { account_exists: boolean }>
    >`
      select
        true as account_exists,
        (account.status = 'active' and account.credential_state = 'set'
          and student_role.account_id is not null
          and settings.current_academic_year between student.entry_year
            and student.access_ends_academic_year) as "canMutate",
        count(*) filter (
          where work.activity_state = 'active' and draft.work_id is not null
        )::integer as "draftCount",
        count(*) filter (
          where work.activity_state = 'active' and draft.work_id is not null
            and latest_revision.status = 'changes_requested'
        )::integer as "changeRequestCount",
        count(*) filter (
          where work.activity_state = 'active' and pending_revision.id is not null
        )::integer as "pendingReviewCount",
        count(*) filter (
          where work.activity_state = 'active' and work.publication_state = 'published'
        )::integer as "publishedCount",
        (
          select count(*)::integer from private.notifications as notification
          where notification.recipient_person_id = account.person_id
            and notification.audience = 'student' and notification.read_at is null
            and notification.created_at >= now() - interval '180 days'
        ) as "unreadNotificationCount",
        (
          select recent_work.public_id from public.works as recent_work
          join private.work_drafts as recent_draft
            on recent_draft.work_id = recent_work.id and recent_draft.lifecycle_state = 'active'
          where recent_work.submitter_person_id = account.person_id
            and recent_work.activity_state = 'active'
            and not exists (
              select 1 from private.work_revisions as pending
              where pending.work_id = recent_work.id and pending.status = 'pending_review'
            )
          order by recent_work.updated_at desc, recent_work.public_id desc limit 1
        ) as "latestActionableDraftPublicId"
      from public.accounts as account
      join public.students as student on student.person_id = account.person_id
      left join public.account_roles as student_role
        on student_role.account_id = account.id and student_role.role = 'student'
      left join public.academic_settings as settings on settings.singleton = true
      left join public.works as work on work.submitter_person_id = account.person_id
      left join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      left join private.work_revisions as pending_revision
        on pending_revision.work_id = work.id and pending_revision.status = 'pending_review'
      left join lateral (
        select revision.status from private.work_revisions as revision
        where revision.work_id = work.id
          and revision.status in ('approved', 'changes_requested')
        order by revision.revision_number desc limit 1
      ) as latest_revision on true
      where account.id = ${accountId}
      group by account.id, account.person_id, student.entry_year,
        student.access_ends_academic_year, student_role.account_id,
        settings.current_academic_year
    `;
    const row = rows[0];
    if (row === undefined) return null;
    return {
      canMutate: row.canMutate,
      changeRequestCount: row.changeRequestCount,
      draftCount: row.draftCount,
      latestActionableDraftPublicId: row.latestActionableDraftPublicId,
      pendingReviewCount: row.pendingReviewCount,
      publishedCount: row.publishedCount,
      unreadNotificationCount: row.unreadNotificationCount,
    };
  }

  async seedDraft(input: Parameters<WorksRepository['seedDraft']>[0]): Promise<WorkMutationResult> {
    const requestPayload: postgres.JSONValue = {
      expectedPublishedRevisionId: input.expectedPublishedRevisionId,
      publicId: input.publicId,
    };
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'published_work_draft_seeded',
          requestPayload,
        );
        const replayResult = await this.toReplayResult(transaction, input.actorAccountId, replay);
        if (replayResult !== null) return replayResult;

        const rows = await transaction<OwnedWorkStateRow[]>`
          select work.id as work_id, work.public_id, work.activity_state,
            work.publication_state, work.published_revision_id
          from public.works as work
          join public.accounts as account on account.person_id = work.submitter_person_id
          where account.id = ${input.actorAccountId} and work.public_id = ${input.publicId}
            and work.activity_state = 'active'
          for update of work
        `;
        const work = rows[0];
        if (work === undefined) return { outcome: 'not_found' };
        const concurrentReplay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'published_work_draft_seeded',
          requestPayload,
        );
        const concurrentReplayResult = await this.toReplayResult(
          transaction,
          input.actorAccountId,
          concurrentReplay,
        );
        if (concurrentReplayResult !== null) return concurrentReplayResult;
        if (work.publication_state === 'never_published' || work.published_revision_id === null) {
          return { outcome: 'work_not_published' };
        }
        if (work.published_revision_id !== input.expectedPublishedRevisionId) {
          return { outcome: 'published_revision_conflict' };
        }
        const state = await transaction<Array<{ has_draft: boolean; has_pending: boolean }>>`
          select
            exists(
              select 1 from private.work_drafts
              where work_id = ${work.work_id} and lifecycle_state = 'active'
            ) as has_draft,
            exists(
              select 1 from private.work_revisions
              where work_id = ${work.work_id} and status = 'pending_review'
            ) as has_pending
        `;
        const current = this.required(state[0]);
        if (current.has_draft) return { outcome: 'draft_exists' };
        if (current.has_pending) return { outcome: 'pending_revision_exists' };

        const resultingVersion = await this.seedDraftFromRevision(
          transaction,
          work.work_id,
          work.published_revision_id,
          input.now,
        );
        await transaction`
          update public.works set version = version + 1, updated_at = ${input.now}
          where id = ${work.work_id}
        `;
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'published_work_draft_seeded',
          requestPayload,
          resultingVersion,
          workId: work.work_id,
        });
        const seeded = await this.findOwnedDraftByWorkId(
          transaction,
          input.actorAccountId,
          work.work_id,
        );
        if (seeded === null) throw new Error('WORK_DRAFT_SEED_READ_FAILED');
        return { outcome: 'created', work: seeded };
      });
    } catch (error: unknown) {
      return this.resolveConcurrentReplay(error, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        operation: 'published_work_draft_seeded',
        requestPayload,
      });
    }
  }

  async rebaseDraft(
    input: Parameters<WorksRepository['rebaseDraft']>[0],
  ): Promise<WorkMutationResult> {
    const requestPayload: postgres.JSONValue = {
      expectedPublishedRevisionId: input.expectedPublishedRevisionId,
      expectedVersion: input.expectedVersion,
      publicId: input.publicId,
    };
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'work_draft_rebased',
          requestPayload,
        );
        const replayResult = await this.toReplayResult(transaction, input.actorAccountId, replay);
        if (replayResult !== null) return replayResult;
        const rows = await transaction<Array<OwnedWorkStateRow & { draft_version: string }>>`
          select work.id as work_id, work.public_id, work.activity_state,
            work.publication_state, work.published_revision_id,
            draft.version as draft_version
          from public.works as work
          join public.accounts as account on account.person_id = work.submitter_person_id
          join private.work_drafts as draft
            on draft.work_id = work.id and draft.lifecycle_state = 'active'
          where account.id = ${input.actorAccountId} and work.public_id = ${input.publicId}
            and work.activity_state = 'active'
          for update of work, draft
        `;
        const work = rows[0];
        if (work === undefined) return { outcome: 'not_found' };
        const concurrentReplay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'work_draft_rebased',
          requestPayload,
        );
        const concurrentReplayResult = await this.toReplayResult(
          transaction,
          input.actorAccountId,
          concurrentReplay,
        );
        if (concurrentReplayResult !== null) return concurrentReplayResult;
        if (work.publication_state !== 'published' || work.published_revision_id === null) {
          return { outcome: 'work_not_published' };
        }
        if (work.published_revision_id !== input.expectedPublishedRevisionId) {
          return { outcome: 'published_revision_conflict' };
        }
        if (Number(work.draft_version) !== input.expectedVersion) {
          return { outcome: 'version_conflict' };
        }
        const resultingVersion = input.expectedVersion + 1;
        await transaction`
          update private.work_drafts
          set base_published_revision_id = ${work.published_revision_id},
            version = ${resultingVersion}, updated_at = ${input.now}
          where work_id = ${work.work_id}
        `;
        await transaction`
          update public.works set updated_at = ${input.now} where id = ${work.work_id}
        `;
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'work_draft_rebased',
          requestPayload,
          resultingVersion,
          workId: work.work_id,
        });
        const rebased = await this.findOwnedDraftByWorkId(
          transaction,
          input.actorAccountId,
          work.work_id,
        );
        if (rebased === null) throw new Error('WORK_DRAFT_REBASE_READ_FAILED');
        return { outcome: 'updated', work: rebased };
      });
    } catch (error: unknown) {
      return this.resolveConcurrentReplay(error, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        operation: 'work_draft_rebased',
        requestPayload,
      });
    }
  }

  async updateDraft(input: {
    actorAccountId: string;
    draft: NormalizedWorkDraft;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    publicId: string;
  }): Promise<WorkMutationResult> {
    const requestPayload = this.updateRequestPayload(
      input.draft,
      input.expectedVersion,
      input.publicId,
    );
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'work_draft_updated',
          requestPayload,
        );
        const replayResult = await this.toReplayResult(transaction, input.actorAccountId, replay);
        if (replayResult !== null) return replayResult;

        const owned = await transaction<OwnedWorkRow[]>`
          select work.id as work_id, draft.version
          from public.works as work
          join public.accounts as account
            on account.person_id = work.submitter_person_id
          join private.work_drafts as draft
            on draft.work_id = work.id and draft.lifecycle_state = 'active'
          where account.id = ${input.actorAccountId}
            and work.public_id = ${input.publicId}
            and work.activity_state = 'active'
          for update of work, draft
        `;
        const current = owned[0];
        if (current === undefined) return { outcome: 'not_found' };
        if (Number(current.version) !== input.expectedVersion) {
          return { outcome: 'version_conflict' };
        }

        const resultingVersion = input.expectedVersion + 1;
        await transaction`
          update private.work_drafts
          set title = ${input.draft.title},
              summary = ${input.draft.summary},
              description = ${input.draft.description},
              category = ${input.draft.category},
              academic_year = ${input.draft.academicPeriod.year},
              semester = ${input.draft.academicPeriod.semester},
              version = ${resultingVersion},
              updated_at = ${input.now}
          where work_id = ${current.work_id}
        `;
        await transaction`delete from private.work_draft_links where work_id = ${current.work_id}`;
        await transaction`delete from private.work_draft_tags where work_id = ${current.work_id}`;
        await transaction`delete from private.work_draft_video_links where work_id = ${current.work_id}`;
        await this.insertLinksAndTags(transaction, current.work_id, input.draft);
        await transaction`
          update public.works set updated_at = ${input.now} where id = ${current.work_id}
        `;
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'work_draft_updated',
          requestPayload,
          resultingVersion,
          workId: current.work_id,
        });
        const updated = await this.findOwnedDraftByWorkId(
          transaction,
          input.actorAccountId,
          current.work_id,
        );
        if (updated === null) throw new Error('WORK_UPDATE_READ_FAILED');
        return { outcome: 'updated', work: updated };
      });
    } catch (error: unknown) {
      return this.resolveConcurrentReplay(error, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        operation: 'work_draft_updated',
        requestPayload,
      });
    }
  }

  async patchDraft(
    input: Parameters<WorksRepository['patchDraft']>[0],
  ): Promise<WorkMutationResult> {
    const requestPayload = this.patchRequestPayload(
      input.patch,
      input.expectedVersion,
      input.publicId,
    );
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'work_draft_updated',
          requestPayload,
        );
        const replayResult = await this.toReplayResult(transaction, input.actorAccountId, replay);
        if (replayResult !== null) return replayResult;

        const owned = await transaction<Array<OwnedWorkRow & { has_pending: boolean }>>`
          select work.id as work_id, draft.version,
            exists (
              select 1 from private.work_revisions as revision
              where revision.work_id = work.id and revision.status = 'pending_review'
            ) as has_pending
          from public.works as work
          join public.accounts as account on account.person_id = work.submitter_person_id
          join private.work_drafts as draft
            on draft.work_id = work.id and draft.lifecycle_state = 'active'
          where account.id = ${input.actorAccountId}
            and work.public_id = ${input.publicId}
            and work.activity_state = 'active'
          for update of work, draft
        `;
        const current = owned[0];
        if (current === undefined) return { outcome: 'not_found' };
        if (current.has_pending) return { outcome: 'pending_revision_exists' };
        if (Number(current.version) !== input.expectedVersion) {
          return { outcome: 'version_conflict' };
        }

        const patch = input.patch;
        const hasAcademicPeriod = patch.academicPeriod !== undefined;
        const resultingVersion = input.expectedVersion + 1;
        await transaction`
          update private.work_drafts
          set title = case when ${patch.title !== undefined} then ${patch.title ?? null} else title end,
            summary = case when ${patch.summary !== undefined} then ${patch.summary ?? null} else summary end,
            description = case when ${patch.description !== undefined}
              then ${patch.description ?? null} else description end,
            category = case when ${patch.category !== undefined}
              then ${patch.category ?? null} else category end,
            academic_year = case when ${hasAcademicPeriod}
              then ${patch.academicPeriod?.year ?? null} else academic_year end,
            semester = case when ${hasAcademicPeriod}
              then ${patch.academicPeriod?.semester ?? null} else semester end,
            submitter_study_year = case when ${patch.submitterStudyYear !== undefined}
              then ${patch.submitterStudyYear ?? null} else submitter_study_year end,
            version = ${resultingVersion}, updated_at = ${input.now}
          where work_id = ${current.work_id}
        `;
        if (patch.links !== undefined) {
          await transaction`delete from private.work_draft_links where work_id = ${current.work_id}`;
          await this.insertLinks(transaction, current.work_id, patch.links);
        }
        if (patch.tags !== undefined) {
          await transaction`delete from private.work_draft_tags where work_id = ${current.work_id}`;
          await this.insertTags(transaction, current.work_id, patch.tags);
        }
        if (patch.videoLinks !== undefined) {
          await transaction`delete from private.work_draft_video_links where work_id = ${current.work_id}`;
          await this.insertVideoLinks(transaction, current.work_id, patch.videoLinks);
        }
        await transaction`
          update public.works set version = version + 1, updated_at = ${input.now}
          where id = ${current.work_id}
        `;
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'work_draft_updated',
          requestPayload,
          resultingVersion,
          workId: current.work_id,
        });
        const updated = await this.findOwnedDraftByWorkId(
          transaction,
          input.actorAccountId,
          current.work_id,
        );
        if (updated === null) throw new Error('WORK_UPDATE_READ_FAILED');
        return { outcome: 'updated', work: updated };
      });
    } catch (error: unknown) {
      return this.resolveConcurrentReplay(error, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        operation: 'work_draft_updated',
        requestPayload,
      });
    }
  }

  private async insertDraft(
    transaction: postgres.TransactionSql,
    workId: string,
    patch: NormalizedWorkDraftPatch,
    now: Date,
    version: number,
  ): Promise<void> {
    await transaction`
      insert into private.work_drafts (
        work_id,
        base_published_revision_id,
        title,
        summary,
        description,
        category,
        academic_year,
        semester,
        version,
        created_at,
        updated_at
      ) values (
        ${workId},
        null,
        ${patch.title ?? null},
        ${patch.summary ?? null},
        ${patch.description ?? null},
        ${patch.category ?? null},
        ${patch.academicPeriod?.year ?? null},
        ${patch.academicPeriod?.semester ?? null},
        ${version},
        ${now},
        ${now}
      )
    `;
    if (patch.submitterStudyYear !== undefined) {
      await transaction`
        update private.work_drafts set submitter_study_year = ${patch.submitterStudyYear ?? null}
        where work_id = ${workId}
      `;
    }
    await this.insertLinks(transaction, workId, patch.links ?? []);
    await this.insertTags(transaction, workId, patch.tags ?? []);
    await this.insertVideoLinks(transaction, workId, patch.videoLinks ?? []);
  }

  private async insertLinksAndTags(
    transaction: postgres.TransactionSql,
    workId: string,
    draft: NormalizedWorkDraft,
  ): Promise<void> {
    await this.insertLinks(transaction, workId, draft.links);
    await this.insertTags(transaction, workId, draft.tags);
    await this.insertVideoLinks(transaction, workId, draft.videoLinks ?? []);
  }

  private async insertLinks(
    transaction: postgres.TransactionSql,
    workId: string,
    links: NormalizedWorkDraft['links'],
  ): Promise<void> {
    for (const [index, link] of links.entries()) {
      await transaction`
        insert into private.work_draft_links (work_id, position, label, url)
        values (${workId}, ${index + 1}, ${link.label}, ${link.url})
      `;
    }
  }

  private async insertTags(
    transaction: postgres.TransactionSql,
    workId: string,
    tags: NormalizedWorkDraft['tags'],
  ): Promise<void> {
    for (const [index, tag] of tags.entries()) {
      await transaction`
        insert into private.work_draft_tags (
          work_id, position, display_label, normalized_identity
        ) values (
          ${workId}, ${index + 1}, ${tag.displayLabel}, ${tag.normalizedIdentity}
        )
      `;
    }
  }

  private async insertVideoLinks(
    transaction: postgres.TransactionSql,
    workId: string,
    videoLinks: NormalizedWorkDraft['videoLinks'],
  ): Promise<void> {
    for (const [index, videoLink] of videoLinks.entries()) {
      await transaction`
        insert into private.work_draft_video_links (work_id, position, provider, provider_video_id, url)
        values (
          ${workId}, ${index + 1}, ${videoLink.provider}, ${videoLink.providerVideoId}, ${videoLink.url}
        )
      `;
    }
  }

  private findOwnedDraftByWorkId(
    sql: postgres.Sql | postgres.TransactionSql,
    accountId: string,
    workId: string,
  ): Promise<WorkDraftView | null> {
    return this.findOneOwnedDraft(sql, accountId, 'id', workId);
  }

  private async findOneOwnedDraft(
    sql: postgres.Sql | postgres.TransactionSql,
    accountId: string,
    identifier: 'id' | 'public_id',
    value: string,
  ): Promise<WorkDraftView | null> {
    const identifierFragment = identifier === 'id' ? sql`work.id` : sql`work.public_id`;
    const rows = await sql<WorkRow[]>`
      select
        work.id as work_id,
        work.public_id,
        work.activity_state,
        work.publication_state,
        work.published_revision_id,
        draft.base_published_revision_id,
        draft.title,
        draft.summary,
        draft.description,
        draft.category,
        draft.academic_year,
        draft.semester,
        draft.version,
        draft.updated_at as saved_at,
        draft.submitter_study_year,
        concat_ws(' ', submitter_name.first_name_th, submitter_name.last_name_th)
          as submitter_attribution_name,
        exists (
          select 1 from private.work_draft_media as poster_reference
          join private.work_media_assets as poster on poster.id = poster_reference.asset_id
          where poster_reference.work_id = work.id
            and poster_reference.media_kind = 'poster' and poster.status = 'ready'
        ) as has_ready_poster,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'publicId', contributor.public_id,
            'kind', contributor.kind,
            'attributionName', contributor.attribution_name,
            'contributionRole', contributor.contribution_role
          ) order by contributor.position)
          from private.work_draft_contributors as contributor
          where contributor.work_id = work.id and contributor.removed_at is null
        ), '[]'::jsonb) as contributors,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'assetId', media.asset_id,
            'kind', media.media_kind,
            'position', media.position,
            'status', asset.status,
            'rejectionCode', asset.rejection_code,
            'width', asset.width,
            'height', asset.height
          ) order by media.media_kind desc, media.position)
          from private.work_draft_media as media
          join private.work_media_assets as asset on asset.id = media.asset_id
          where media.work_id = work.id
        ), '[]'::jsonb) as media,
        coalesce((
          select jsonb_agg(
            jsonb_build_object('label', link.label, 'url', link.url)
            order by link.position
          )
          from private.work_draft_links as link
          where link.work_id = work.id
        ), '[]'::jsonb) as draft_links,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'displayLabel', tag.display_label,
              'normalizedIdentity', tag.normalized_identity
            ) order by tag.position
          )
          from private.work_draft_tags as tag
          where tag.work_id = work.id
        ), '[]'::jsonb) as draft_tags
        , coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'provider', video.provider,
              'providerVideoId', video.provider_video_id,
              'url', video.url
            ) order by video.position
          )
          from private.work_draft_video_links as video
          where video.work_id = work.id
        ), '[]'::jsonb) as draft_video_links
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      join private.person_names as submitter_name
        on submitter_name.person_id = work.submitter_person_id
      where account.id = ${accountId}
        and ${identifierFragment} = ${value}
        and work.activity_state = 'active'
      limit 1
    `;
    const row = rows[0];
    return row === undefined ? null : this.mapWork(row);
  }

  private mapWork(row: WorkRow): WorkDraftView {
    return {
      activityState: row.activity_state,
      basePublishedRevisionId: row.base_published_revision_id,
      contributors: row.contributors,
      draft: {
        academicPeriod: { semester: row.semester, year: row.academic_year },
        category: row.category,
        description: row.description,
        links: row.draft_links,
        submitterStudyYear: row.submitter_study_year,
        summary: row.summary,
        tags: row.draft_tags,
        title: row.title,
        videoLinks: row.draft_video_links,
      },
      isComplete:
        row.title !== null &&
        row.summary !== null &&
        row.description !== null &&
        row.category !== null &&
        row.academic_year !== null &&
        row.semester !== null &&
        row.submitter_study_year !== null &&
        row.submitter_attribution_name !== null &&
        row.has_ready_poster &&
        row.contributors.every((contributor) => contributor.contributionRole !== null),
      media: row.media,
      publicationState: row.publication_state,
      publishedRevisionId: row.published_revision_id,
      publicId: row.public_id,
      savedAt: row.saved_at,
      submitterAttributionName: row.submitter_attribution_name,
      version: Number(row.version),
    };
  }

  private async seedDraftFromRevision(
    sql: postgres.TransactionSql,
    workId: string,
    revisionId: string,
    now: Date,
  ): Promise<number> {
    const drafts = await sql<Array<{ version: string }>>`
      insert into private.work_drafts as existing (
        work_id, base_published_revision_id, title, summary, description, category,
        academic_year, semester, submitter_study_year, lifecycle_state,
        version, created_at, updated_at
      ) select
        ${workId}, revision.id, revision.title, revision.summary, revision.description,
        revision.category, revision.academic_year, revision.semester,
        case when submitter.study_year between 1 and 4 then submitter.study_year else null end,
        'active', 1, ${now}, ${now}
      from private.work_revisions as revision
      join private.work_revision_attributions as submitter
        on submitter.revision_id = revision.id and submitter.kind = 'submitter'
      where revision.id = ${revisionId} and revision.work_id = ${workId}
        and revision.status = 'approved'
      on conflict (work_id) do update set
        base_published_revision_id = excluded.base_published_revision_id,
        title = excluded.title,
        summary = excluded.summary,
        description = excluded.description,
        category = excluded.category,
        academic_year = excluded.academic_year,
        semester = excluded.semester,
        submitter_study_year = excluded.submitter_study_year,
        lifecycle_state = 'active',
        version = existing.version + 1,
        updated_at = excluded.updated_at
      returning version
    `;
    const resultingVersion = Number(this.required(drafts[0]).version);
    await sql`delete from private.work_draft_links where work_id = ${workId}`;
    await sql`delete from private.work_draft_tags where work_id = ${workId}`;
    await sql`delete from private.work_draft_video_links where work_id = ${workId}`;
    await sql`delete from private.work_draft_media where work_id = ${workId}`;
    await sql`
      update private.work_draft_contributors
      set removed_at = ${now}, updated_at = ${now}
      where work_id = ${workId} and removed_at is null
    `;
    await sql`insert into private.work_draft_links (work_id, position, label, url)
      select ${workId}, position, label, url
      from private.work_revision_links where revision_id = ${revisionId}`;
    await sql`insert into private.work_draft_tags (work_id, position, display_label, normalized_identity)
      select ${workId}, position, display_label, normalized_identity
      from private.work_revision_tags where revision_id = ${revisionId}`;
    await sql`insert into private.work_draft_video_links (
      work_id, position, provider, provider_video_id, url
    ) select ${workId}, position, provider, provider_video_id, url
      from private.work_revision_video_links where revision_id = ${revisionId}`;
    await sql`insert into private.work_draft_media (
      work_id, media_kind, position, asset_id, created_at
    ) select ${workId}, media_kind, position, asset_id, ${now}
      from private.work_revision_media where revision_id = ${revisionId}`;
    await sql`insert into private.work_draft_contributors (
      work_id, kind, person_id, attribution_name, contribution_role,
      position, created_at, updated_at
    ) select
      ${workId}, attribution.kind, attribution.person_id, attribution.attribution_name,
      attribution.contribution_role, attribution.position - 1, ${now}, ${now}
      from private.work_revision_attributions as attribution
      where attribution.revision_id = ${revisionId}
        and attribution.kind in ('account', 'external')
      order by attribution.position`;
    return resultingVersion;
  }

  private async resolveReplay(
    sql: postgres.TransactionSql,
    actorAccountId: string,
    idempotencyKey: string,
    operation: WorkOperation,
    requestPayload: postgres.JSONValue,
  ): Promise<ReplayResolution> {
    const rows = await sql<OperationRow[]>`
      select
        work_id,
        (
          actor_account_id = ${actorAccountId}
          and operation = ${operation}
          and request_payload = ${sql.json(requestPayload)}
        ) as is_equivalent
      from private.work_operations
      where idempotency_key = ${idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return { outcome: 'none' };
    return row.is_equivalent ? { outcome: 'replay', workId: row.work_id } : { outcome: 'conflict' };
  }

  private async toReplayResult(
    sql: postgres.TransactionSql,
    actorAccountId: string,
    replay: ReplayResolution,
  ): Promise<WorkMutationResult | null> {
    if (replay.outcome === 'none') return null;
    if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
    const work = await this.findOwnedDraftByWorkId(sql, actorAccountId, replay.workId);
    return work === null ? { outcome: 'not_found' } : { outcome: 'replayed', work };
  }

  private async resolveConcurrentReplay(
    error: unknown,
    input: {
      actorAccountId: string;
      idempotencyKey: string;
      operation: WorkOperation;
      requestPayload: postgres.JSONValue;
    },
  ): Promise<WorkMutationResult> {
    if (!this.isIdempotencyKeyConflict(error)) throw error;
    return this.database.sql.begin(async (transaction) => {
      const replay = await this.resolveReplay(
        transaction,
        input.actorAccountId,
        input.idempotencyKey,
        input.operation,
        input.requestPayload,
      );
      const result = await this.toReplayResult(transaction, input.actorAccountId, replay);
      return result ?? { outcome: 'idempotency_conflict' };
    });
  }

  private isIdempotencyKeyConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505' &&
      'constraint_name' in error &&
      error.constraint_name === 'work_operations_pkey'
    );
  }

  private async recordOperation(
    transaction: postgres.TransactionSql,
    input: {
      actorAccountId: string;
      idempotencyKey: string;
      now: Date;
      operation: WorkOperation;
      requestPayload: postgres.JSONValue;
      resultingVersion: number;
      workId: string;
    },
  ): Promise<void> {
    await transaction`
      insert into private.work_operations (
        idempotency_key,
        actor_account_id,
        work_id,
        operation,
        request_payload,
        resulting_version,
        occurred_at
      ) values (
        ${input.idempotencyKey},
        ${input.actorAccountId},
        ${input.workId},
        ${input.operation},
        ${transaction.json(input.requestPayload)},
        ${input.resultingVersion},
        ${input.now}
      )
    `;
  }

  private primaryAction(row: WorkListRow): WorkListItem['primaryAction'] {
    if (row.activity_state === 'archived') {
      return row.archive_source === 'submitter' ? 'return_to_editing' : 'view_details';
    }
    if (row.latest_revision_status === 'pending_review') return 'view_details';
    if (row.has_draft) return 'continue_editing';
    if (row.publication_state === 'unpublished') return 'continue_editing';
    if (row.publication_state === 'published') return 'view_public_work';
    return null;
  }

  private secondaryActions(row: WorkListRow): WorkListItem['secondaryActions'] {
    if (row.activity_state === 'archived') return [];
    if (row.latest_revision_status === 'pending_review') return ['withdraw_submission'];
    if (row.publication_state === 'published' && !row.has_draft) {
      return ['create_new_revision'];
    }
    if (row.publication_state === 'never_published' && row.has_draft) {
      return ['archive_saved_draft'];
    }
    return [];
  }

  private createRequestPayload(patch: NormalizedWorkDraftPatch): postgres.JSONValue {
    return { patch: this.patchPayload(patch) };
  }

  private updateRequestPayload(
    draft: NormalizedWorkDraft,
    expectedVersion: number,
    publicId: string,
  ): postgres.JSONValue {
    return { draft: this.draftPayload(draft), expectedVersion, publicId };
  }

  private draftPayload(draft: NormalizedWorkDraft): postgres.JSONValue {
    return {
      academicPeriod: {
        semester: draft.academicPeriod.semester,
        year: draft.academicPeriod.year,
      },
      category: draft.category,
      description: draft.description,
      links: draft.links.map((link) => ({ label: link.label, url: link.url })),
      summary: draft.summary,
      tags: draft.tags.map((tag) => ({
        displayLabel: tag.displayLabel,
        normalizedIdentity: tag.normalizedIdentity,
      })),
      title: draft.title,
      videoLinks: (draft.videoLinks ?? []).map((videoLink) => ({
        provider: videoLink.provider,
        providerVideoId: videoLink.providerVideoId,
        url: videoLink.url,
      })),
    };
  }

  private patchRequestPayload(
    patch: NormalizedWorkDraftPatch,
    expectedVersion: number,
    publicId: string,
  ): postgres.JSONValue {
    return { expectedVersion, patch: this.patchPayload(patch), publicId };
  }

  private patchPayload(patch: NormalizedWorkDraftPatch): postgres.JSONValue {
    const payload: Record<string, postgres.JSONValue | undefined> = {};
    if (patch.academicPeriod !== undefined) payload.academicPeriod = patch.academicPeriod;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.links !== undefined) payload.links = patch.links;
    if (patch.submitterStudyYear !== undefined) {
      payload.submitterStudyYear = patch.submitterStudyYear;
    }
    if (patch.summary !== undefined) payload.summary = patch.summary;
    if (patch.tags !== undefined) payload.tags = patch.tags;
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.videoLinks !== undefined) {
      payload.videoLinks = patch.videoLinks.map((link) => ({
        provider: link.provider,
        providerVideoId: link.providerVideoId,
        url: link.url,
      }));
    }
    return payload;
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('WORK_PERSISTENCE_INVARIANT');
    return value;
  }

  private async savedDraftMutation(
    input: Parameters<WorksRepository['archiveSavedDraft']>[0],
    operation: 'archive_saved_draft' | 'restore_saved_draft',
  ): ReturnType<WorksRepository['archiveSavedDraft']> {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([operation, input.publicId, input.expectedVersion]))
      .digest('hex');
    return this.database.sql.begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const replayRows = await sql<
        Array<{
          operation: string;
          request_fingerprint: string;
          resulting_work_version: string;
          work_id: string;
        }>
      >`
        select operation, request_fingerprint, resulting_work_version, work_id
        from private.work_saved_draft_operations
        where idempotency_key = ${input.idempotencyKey}
          and actor_account_id = ${input.actorAccountId}
        limit 1
      `;
      const replay = replayRows[0];
      if (replay !== undefined) {
        if (replay.operation !== operation || replay.request_fingerprint !== fingerprint) {
          return { outcome: 'idempotency_conflict' };
        }
        const replayWork = await sql<
          Array<{
            activity_state: 'active' | 'archived';
            publication_state: 'never_published';
            public_id: string;
          }>
        >`
          select activity_state, publication_state, public_id from public.works
          where id = ${replay.work_id}
        `;
        const work = replayWork[0];
        return work === undefined
          ? { outcome: 'not_found' }
          : {
              outcome: 'replayed',
              work: {
                activityState: work.activity_state,
                publicationState: work.publication_state,
                publicId: work.public_id,
                version: Number(replay.resulting_work_version),
              },
            };
      }
      const rows = await sql<
        Array<{
          activity_state: 'active' | 'archived';
          archive_source: 'admin' | 'submitter' | null;
          has_draft: boolean;
          has_pending: boolean;
          id: string;
          publication_state: 'never_published' | 'published' | 'unpublished';
          public_id: string;
          version: string;
        }>
      >`
        select work.id, work.public_id, work.activity_state, work.archive_source,
          work.publication_state, work.version,
          exists(
            select 1 from private.work_drafts
            where work_id = work.id and lifecycle_state = 'active'
          ) as has_draft,
          exists(select 1 from private.work_revisions where work_id = work.id
            and status = 'pending_review') as has_pending
        from public.works as work
        join public.accounts as account on account.person_id = work.submitter_person_id
        where account.id = ${input.actorAccountId} and work.public_id = ${input.publicId}
        for update of work
      `;
      const work = rows[0];
      if (work === undefined) return { outcome: 'not_found' };
      if (Number(work.version) !== input.expectedVersion) return { outcome: 'version_conflict' };
      const transition = evaluateSubmitterSavedDraftTransition({
        activityState: work.activity_state,
        archiveSource: work.archive_source,
        hasDraft: work.has_draft,
        hasPendingRevision: work.has_pending,
        operation,
        publicationState: work.publication_state,
      });
      if (!transition.isAllowed) return { outcome: 'state_conflict' };
      const resultingVersion = input.expectedVersion + 1;
      await sql`
        update public.works set activity_state = ${transition.activityState},
          archive_source = ${operation === 'archive_saved_draft' ? 'submitter' : null},
          version = ${resultingVersion}, updated_at = ${input.now}
        where id = ${work.id}
      `;
      await sql`
        insert into private.work_saved_draft_operations (
          idempotency_key, actor_account_id, work_id, operation, request_fingerprint,
          resulting_work_version, occurred_at
        ) values (
          ${input.idempotencyKey}, ${input.actorAccountId}, ${work.id}, ${operation},
          ${fingerprint}, ${resultingVersion}, ${input.now}
        )
      `;
      return {
        outcome: operation === 'archive_saved_draft' ? 'archived' : 'restored',
        work: {
          activityState: transition.activityState,
          publicationState: 'never_published',
          publicId: work.public_id,
          version: resultingVersion,
        },
      };
    });
  }
}
