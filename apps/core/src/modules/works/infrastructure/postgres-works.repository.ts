import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  WorkAuthoringContext,
  WorkAuthoringState,
  WorkDraftView,
  WorkMutationResult,
  WorksRepository,
} from '../application/works.ports';
import type { NormalizedWorkDraft } from '../domain/work-draft-policy';

type WorkOperation =
  'published_work_draft_seeded' | 'work_created' | 'work_draft_rebased' | 'work_draft_updated';

interface WorkRow {
  academic_year: number;
  activity_state: 'active';
  base_published_revision_id: string | null;
  category: NormalizedWorkDraft['category'];
  description: string;
  draft_links: NormalizedWorkDraft['links'];
  draft_tags: NormalizedWorkDraft['tags'];
  draft_video_links: NonNullable<NormalizedWorkDraft['videoLinks']>;
  publication_state: WorkDraftView['publicationState'];
  published_revision_id: string | null;
  public_id: string;
  semester: NormalizedWorkDraft['academicPeriod']['semester'];
  summary: string;
  title: string;
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

interface OperationRow {
  is_equivalent: boolean;
  work_id: string;
}

type ReplayResolution =
  { outcome: 'conflict' } | { outcome: 'none' } | { outcome: 'replay'; workId: string };

@Injectable()
export class PostgresWorksRepository implements WorksRepository {
  constructor(private readonly database: DatabaseClient) {}

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

  async createWork(input: {
    actorAccountId: string;
    draft: NormalizedWorkDraft;
    idempotencyKey: string;
    now: Date;
    submitterPersonId: string;
  }): Promise<WorkMutationResult> {
    const requestPayload = this.createRequestPayload(input.draft);
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

        await this.insertDraft(transaction, work.work_id, input.draft, input.now, 1);
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
        if (work.publication_state !== 'published' || work.published_revision_id === null) {
          return { outcome: 'work_not_published' };
        }
        if (work.published_revision_id !== input.expectedPublishedRevisionId) {
          return { outcome: 'published_revision_conflict' };
        }
        const state = await transaction<Array<{ has_draft: boolean; has_pending: boolean }>>`
          select
            exists(select 1 from private.work_drafts where work_id = ${work.work_id}) as has_draft,
            exists(
              select 1 from private.work_revisions
              where work_id = ${work.work_id} and status = 'pending_review'
            ) as has_pending
        `;
        const current = this.required(state[0]);
        if (current.has_draft) return { outcome: 'draft_exists' };
        if (current.has_pending) return { outcome: 'pending_revision_exists' };

        await this.seedDraftFromRevision(
          transaction,
          work.work_id,
          work.published_revision_id,
          input.now,
        );
        await transaction`
          update public.works set updated_at = ${input.now} where id = ${work.work_id}
        `;
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'published_work_draft_seeded',
          requestPayload,
          resultingVersion: 1,
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
          join private.work_drafts as draft on draft.work_id = work.id
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
          join private.work_drafts as draft on draft.work_id = work.id
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

  private async insertDraft(
    transaction: postgres.TransactionSql,
    workId: string,
    draft: NormalizedWorkDraft,
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
        ${draft.title},
        ${draft.summary},
        ${draft.description},
        ${draft.category},
        ${draft.academicPeriod.year},
        ${draft.academicPeriod.semester},
        ${version},
        ${now},
        ${now}
      )
    `;
    await this.insertLinksAndTags(transaction, workId, draft);
  }

  private async insertLinksAndTags(
    transaction: postgres.TransactionSql,
    workId: string,
    draft: NormalizedWorkDraft,
  ): Promise<void> {
    for (const [index, link] of draft.links.entries()) {
      await transaction`
        insert into private.work_draft_links (work_id, position, label, url)
        values (${workId}, ${index + 1}, ${link.label}, ${link.url})
      `;
    }
    for (const [index, tag] of draft.tags.entries()) {
      await transaction`
        insert into private.work_draft_tags (
          work_id, position, display_label, normalized_identity
        ) values (
          ${workId}, ${index + 1}, ${tag.displayLabel}, ${tag.normalizedIdentity}
        )
      `;
    }
    for (const [index, videoLink] of (draft.videoLinks ?? []).entries()) {
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
      join private.work_drafts as draft on draft.work_id = work.id
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
      draft: {
        academicPeriod: { semester: row.semester, year: row.academic_year },
        category: row.category,
        description: row.description,
        links: row.draft_links,
        summary: row.summary,
        tags: row.draft_tags,
        title: row.title,
        videoLinks: row.draft_video_links,
      },
      publicationState: row.publication_state,
      publishedRevisionId: row.published_revision_id,
      publicId: row.public_id,
      version: Number(row.version),
    };
  }

  private async seedDraftFromRevision(
    sql: postgres.TransactionSql,
    workId: string,
    revisionId: string,
    now: Date,
  ): Promise<void> {
    await sql`
      insert into private.work_drafts (
        work_id, base_published_revision_id, title, summary, description, category,
        academic_year, semester, version, created_at, updated_at
      ) select
        ${workId}, revision.id, revision.title, revision.summary, revision.description,
        revision.category, revision.academic_year, revision.semester, 1, ${now}, ${now}
      from private.work_revisions as revision
      where revision.id = ${revisionId} and revision.work_id = ${workId}
        and revision.status = 'approved'
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

  private createRequestPayload(draft: NormalizedWorkDraft): postgres.JSONValue {
    return { draft: this.draftPayload(draft) };
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

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('WORK_PERSISTENCE_INVARIANT');
    return value;
  }
}
