import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  WorkAuthoringContext,
  WorkDraftView,
  WorkMutationResult,
  WorksRepository,
} from '../application/works.ports';
import type { NormalizedWorkDraft } from '../domain/work-draft-policy';

type WorkOperation = 'work_created' | 'work_draft_updated';

interface WorkRow {
  academic_year: number;
  activity_state: 'active';
  base_published_revision_id: string | null;
  category: NormalizedWorkDraft['category'];
  description: string;
  draft_links: NormalizedWorkDraft['links'];
  draft_tags: NormalizedWorkDraft['tags'];
  publication_state: 'never_published';
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
  }

  private findOwnedDraftByWorkId(
    sql: postgres.TransactionSql,
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
      },
      publicationState: row.publication_state,
      publicId: row.public_id,
      version: Number(row.version),
    };
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
    };
  }
}
