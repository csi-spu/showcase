import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  ChangeRequestView,
  ReviewRepository,
  ReviewResult,
} from '../application/reviews.ports';

type Sql = postgres.Sql | postgres.TransactionSql;

interface LockedRevisionRow {
  id: string;
  revision_number: string;
  status: 'approved' | 'changes_requested' | 'pending_review' | 'withdrawn';
  submitter_account_id: string;
  title: string;
  version: string;
  work_id: string;
  work_public_id: string;
}

interface ReviewRow {
  decision: 'changes_requested';
  feedback: string;
  public_id: string;
  reason: ChangeRequestView['reason'];
  revision_number: string;
  revision_public_id: string;
  reviewed_at: Date;
  work_public_id: string;
}

type ReplayResolution =
  { outcome: 'conflict' } | { outcome: 'none' } | { outcome: 'replay'; reviewId: string };

@Injectable()
export class PostgresReviewsRepository implements ReviewRepository {
  constructor(private readonly database: DatabaseClient) {}

  async requestChanges(
    input: Parameters<ReviewRepository['requestChanges']>[0],
  ): Promise<ReviewResult> {
    const payload = this.requestPayload(input);
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

        const rows = await transaction<LockedRevisionRow[]>`
          select revision.id, revision.revision_number, revision.status, revision.title,
            revision.version, work.id as work_id, work.public_id as work_public_id,
            submitter_account.id as submitter_account_id
          from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          join public.accounts as submitter_account
            on submitter_account.person_id = work.submitter_person_id
          join public.account_roles as submitter_role
            on submitter_role.account_id = submitter_account.id and submitter_role.role = 'student'
          where revision.public_id = ${input.revisionPublicId}
          for update of revision, work
        `;
        const revision = rows[0];
        if (revision === undefined) return { outcome: 'revision_not_found' };

        const concurrentReplay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          payload,
        );
        const concurrentResult = await this.toReplayResult(transaction, concurrentReplay);
        if (concurrentResult !== null) return concurrentResult;

        if (revision.status !== 'pending_review') {
          return { outcome: 'revision_state_conflict' };
        }
        if (Number(revision.version) !== input.expectedRevisionVersion) {
          return { outcome: 'revision_version_conflict' };
        }

        const inserted = await transaction<Array<{ id: string }>>`
          insert into private.reviews (
            revision_id, actor_account_id, decision, reason, feedback,
            expected_revision_version, resulting_revision_version, idempotency_key,
            request_payload, reviewed_at
          ) values (
            ${revision.id}, ${input.actorAccountId}, 'changes_requested', ${input.reason},
            ${input.feedback}, ${input.expectedRevisionVersion},
            ${input.expectedRevisionVersion + 1}, ${input.idempotencyKey},
            ${transaction.json(payload)}, ${input.now}
          ) returning id
        `;
        const reviewId = this.required(inserted[0]).id;
        await transaction`
          update private.work_revisions
          set status = 'changes_requested', version = version + 1
          where id = ${revision.id}
        `;
        await this.seedDraftFromRevision(transaction, revision.work_id, revision.id, input.now);
        await transaction`
          update public.works set updated_at = ${input.now} where id = ${revision.work_id}
        `;
        await transaction`
          insert into private.outbox_events (
            aggregate_type, aggregate_id, event_type, payload, occurred_at
          ) values (
            'work_revision', ${input.revisionPublicId}, 'work_revision_changes_requested',
            ${transaction.json({
              audience: 'student',
              parameters: {
                revisionNumber: Number(revision.revision_number),
                title: revision.title,
              },
              recipientAccountId: revision.submitter_account_id,
              target: { kind: 'work', workPublicId: revision.work_public_id },
              type: 'work_change_requested',
            })},
            ${input.now}
          ) on conflict (aggregate_type, aggregate_id, event_type) do nothing
        `;
        const review = await this.findReviewById(transaction, reviewId);
        if (review === null) throw new Error('REVIEW_CREATE_READ_FAILED');
        return { outcome: 'changed_requested', review };
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

  async findLatestChangeRequestForSubmitter(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<ChangeRequestView | null> {
    const rows = await this.database.sql<Array<{ review_id: string }>>`
      select review.id as review_id
      from private.reviews as review
      join private.work_revisions as revision on revision.id = review.revision_id
      join public.works as work on work.id = revision.work_id
      join public.accounts as account on account.person_id = work.submitter_person_id
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
        and review.decision = 'changes_requested'
      order by review.reviewed_at desc, review.id desc
      limit 1
    `;
    const row = rows[0];
    return row === undefined ? null : this.findReviewById(this.database.sql, row.review_id);
  }

  async findRevisionMediaObject(
    revisionPublicId: string,
    assetId: string,
  ): Promise<{ assetId: string; masterObjectKey: string } | null> {
    const rows = await this.database.sql<Array<{ asset_id: string; master_object_key: string }>>`
      select asset.id as asset_id, asset.master_object_key
      from private.work_revisions as revision
      join private.work_revision_media as media on media.revision_id = revision.id
      join private.work_media_assets as asset on asset.id = media.asset_id
      where revision.public_id = ${revisionPublicId}
        and revision.status = 'pending_review'
        and asset.id = ${assetId}
        and asset.status = 'ready'
        and asset.master_object_key is not null
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : { assetId: row.asset_id, masterObjectKey: row.master_object_key };
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
        ${workId}, revision.base_published_revision_id, revision.title, revision.summary,
        revision.description, revision.category, revision.academic_year, revision.semester,
        1, ${now}, ${now}
      from private.work_revisions as revision where revision.id = ${revisionId}
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
    await sql`insert into private.work_draft_media (work_id, media_kind, position, asset_id, created_at)
      select ${workId}, media_kind, position, asset_id, ${now}
      from private.work_revision_media where revision_id = ${revisionId}`;
  }

  private async resolveReplay(
    sql: Sql,
    actorAccountId: string,
    idempotencyKey: string,
    payload: postgres.JSONValue,
  ): Promise<ReplayResolution> {
    const rows = await sql<Array<{ id: string; is_equivalent: boolean }>>`
      select id, (
        actor_account_id = ${actorAccountId} and request_payload = ${sql.json(payload)}
      ) as is_equivalent
      from private.reviews where idempotency_key = ${idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return { outcome: 'none' };
    return row.is_equivalent ? { outcome: 'replay', reviewId: row.id } : { outcome: 'conflict' };
  }

  private async toReplayResult(sql: Sql, replay: ReplayResolution): Promise<ReviewResult | null> {
    if (replay.outcome === 'none') return null;
    if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
    const review = await this.findReviewById(sql, replay.reviewId);
    return review === null ? { outcome: 'revision_not_found' } : { outcome: 'replayed', review };
  }

  private async findReviewById(sql: Sql, reviewId: string): Promise<ChangeRequestView | null> {
    const rows = await sql<ReviewRow[]>`
      select review.public_id, review.decision, review.reason, review.feedback,
        review.reviewed_at, revision.public_id as revision_public_id,
        revision.revision_number, work.public_id as work_public_id
      from private.reviews as review
      join private.work_revisions as revision on revision.id = review.revision_id
      join public.works as work on work.id = revision.work_id
      where review.id = ${reviewId}
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          decision: row.decision,
          feedback: row.feedback,
          publicId: row.public_id,
          reason: row.reason,
          revisionNumber: Number(row.revision_number),
          revisionPublicId: row.revision_public_id,
          reviewedAt: row.reviewed_at.toISOString(),
          workPublicId: row.work_public_id,
        };
  }

  private requestPayload(
    input: Parameters<ReviewRepository['requestChanges']>[0],
  ): postgres.JSONValue {
    return {
      expectedRevisionVersion: input.expectedRevisionVersion,
      feedback: input.feedback,
      reason: input.reason,
      revisionPublicId: input.revisionPublicId,
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
    if (value === undefined) throw new Error('REVIEW_PERSISTENCE_INVARIANT');
    return value;
  }
}
