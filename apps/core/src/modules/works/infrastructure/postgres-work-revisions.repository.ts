import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  AdminCorrectionContext,
  AdminCorrectionResult,
  AdminCorrectionsRepository,
} from '../application/admin-corrections.ports';
import type {
  ReviewQueuePage,
  WorkRevisionAttributionView,
  WorkRevisionMediaView,
  WorkRevisionRepository,
  WorkRevisionResult,
  WorkRevisionView,
} from '../application/work-revisions.ports';
import type { NormalizedWorkDraft } from '../domain/work-draft-policy';
import {
  evaluateWorkRevisionCandidate,
  type RevisionInvitation,
} from '../domain/work-revision-policy';

type Sql = postgres.Sql | postgres.TransactionSql;
type Operation = 'revision_submitted' | 'revision_withdrawn';

interface LockedDraftRow {
  academic_year: number;
  base_published_revision_id: string | null;
  category: NormalizedWorkDraft['category'];
  current_academic_year: number;
  description: string;
  entry_year: number;
  published_revision_id: string | null;
  semester: NormalizedWorkDraft['academicPeriod']['semester'];
  submitter_person_id: string;
  summary: string;
  title: string;
  version: string;
  work_id: string;
}

interface LockedWorkRow {
  work_id: string;
}

interface RevisionRow {
  academic_year: number;
  author_kind: WorkRevisionView['authorKind'];
  attributions: WorkRevisionAttributionView[];
  base_published_revision_id: string | null;
  category: NormalizedWorkDraft['category'];
  description: string;
  links: NormalizedWorkDraft['links'];
  media: WorkRevisionMediaView[];
  public_id: string;
  revision_id: string;
  revision_number: string;
  semester: NormalizedWorkDraft['academicPeriod']['semester'];
  status: WorkRevisionView['status'];
  submitted_at: Date;
  summary: string;
  tags: NormalizedWorkDraft['tags'];
  title: string;
  version: string;
  video_links: NormalizedWorkDraft['videoLinks'];
  withdrawn_at: Date | null;
  work_public_id: string;
}

interface OperationRow {
  is_equivalent: boolean;
  revision_id: string;
}

type ReplayResolution =
  { outcome: 'conflict' } | { outcome: 'none' } | { outcome: 'replay'; revisionId: string };

interface LockedCorrectionRow {
  activity_state: 'active' | 'archived';
  base_revision_id: string;
  base_revision_public_id: string;
  base_revision_version: string;
  publication_state: 'never_published' | 'published' | 'unpublished';
  published_revision_id: string | null;
  submitter_account_id: string;
  work_id: string;
}

type CorrectionReplayResolution =
  { outcome: 'conflict' } | { outcome: 'none' } | { outcome: 'replay'; revisionId: string };

@Injectable()
export class PostgresWorkRevisionsRepository
  implements WorkRevisionRepository, AdminCorrectionsRepository
{
  constructor(private readonly database: DatabaseClient) {}

  async findCorrectionContext(workPublicId: string): Promise<AdminCorrectionContext | null> {
    const rows = await this.database.sql<
      Array<{
        current_academic_year: number;
        entry_year: number;
        revision_id: string;
      }>
    >`
      select revision.id as revision_id, student.entry_year, settings.current_academic_year
      from public.works as work
      join private.work_revisions as revision on revision.id = work.published_revision_id
      join public.students as student on student.person_id = work.submitter_person_id
      join public.academic_settings as settings on settings.singleton = true
      where work.public_id = ${workPublicId}
        and work.activity_state = 'active'
        and work.publication_state = 'published'
        and revision.status = 'approved'
        and settings.current_academic_year is not null
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return null;
    const publishedRevision = await this.findRevisionById(this.database.sql, row.revision_id);
    return publishedRevision === null
      ? null
      : {
          academicRange: {
            currentAcademicYear: row.current_academic_year,
            entryYear: row.entry_year,
          },
          publishedRevision,
        };
  }

  async createCorrection(
    input: Parameters<AdminCorrectionsRepository['createCorrection']>[0],
  ): Promise<AdminCorrectionResult> {
    const requestFingerprint = this.correctionFingerprint(input);
    try {
      return await this.database.sql.begin(async (transaction) => {
        const initialReplay = await this.resolveCorrectionReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          requestFingerprint,
        );
        const initialResult = await this.toCorrectionReplayResult(transaction, initialReplay);
        if (initialResult !== null) return initialResult;

        const rows = await transaction<LockedCorrectionRow[]>`
        select work.id as work_id, work.activity_state, work.publication_state,
          work.published_revision_id, revision.id as base_revision_id,
          revision.public_id as base_revision_public_id,
          revision.version as base_revision_version, account.id as submitter_account_id
        from public.works as work
        left join private.work_revisions as revision on revision.id = work.published_revision_id
        join public.accounts as account on account.person_id = work.submitter_person_id
        where work.public_id = ${input.workPublicId}
        for update of work
      `;
        const work = rows[0];
        if (work === undefined) return { outcome: 'not_found' };

        const concurrentReplay = await this.resolveCorrectionReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          requestFingerprint,
        );
        const concurrentResult = await this.toCorrectionReplayResult(transaction, concurrentReplay);
        if (concurrentResult !== null) return concurrentResult;
        if (
          work.activity_state !== 'active' ||
          work.publication_state !== 'published' ||
          work.published_revision_id === null
        ) {
          return { outcome: 'work_state_conflict' };
        }
        if (work.base_revision_public_id !== input.expectedPublishedRevisionId) {
          return { outcome: 'base_revision_conflict' };
        }
        if (Number(work.base_revision_version) !== input.expectedRevisionVersion) {
          return { outcome: 'revision_version_conflict' };
        }
        const pending = await transaction<Array<{ exists: boolean }>>`
        select exists(
          select 1 from private.work_revisions
          where work_id = ${work.work_id} and status = 'pending_review'
        ) as exists
      `;
        if (this.required(pending[0]).exists) return { outcome: 'pending_revision_exists' };

        const numberRows = await transaction<Array<{ next_number: string }>>`
        select (coalesce(max(revision_number), 0) + 1)::bigint as next_number
        from private.work_revisions where work_id = ${work.work_id}
      `;
        const revisionNumber = Number(this.required(numberRows[0]).next_number);
        const inserted = await transaction<Array<{ id: string; public_id: string }>>`
        insert into private.work_revisions (
          work_id, revision_number, status, base_published_revision_id, draft_version,
          author_kind, title, summary, description, category, academic_year, semester, submitted_at
        ) values (
          ${work.work_id}, ${revisionNumber}, 'pending_review', ${work.base_revision_id}, null,
          'admin_correction', ${input.candidate.title}, ${input.candidate.summary},
          ${input.candidate.description}, ${input.candidate.category},
          ${input.candidate.academicPeriod.year}, ${input.candidate.academicPeriod.semester},
          ${input.now}
        ) returning id, public_id
      `;
        const revision = this.required(inserted[0]);
        await this.copyCorrectionSnapshot(
          transaction,
          revision.id,
          work.base_revision_id,
          input.candidate,
        );
        await transaction`
        insert into private.admin_correction_audits (
          idempotency_key, actor_account_id, work_id, base_revision_id, revision_id,
          reason, diff_metadata, request_fingerprint, occurred_at
        ) values (
          ${input.idempotencyKey}, ${input.actorAccountId}, ${work.work_id},
          ${work.base_revision_id}, ${revision.id}, ${input.reason},
          ${transaction.json({
            categories: input.diff.categories,
            fields: input.diff.fields,
          })}, ${requestFingerprint}, ${input.now}
        )
      `;
        await transaction`update public.works set updated_at = ${input.now} where id = ${work.work_id}`;
        await this.emitEvent(
          transaction,
          revision.public_id,
          'admin_correction_created',
          {
            audience: 'student',
            parameters: { revisionNumber, title: input.candidate.title },
            recipientAccountIds: [work.submitter_account_id],
            revisionPublicId: revision.public_id,
            target: { kind: 'work', workPublicId: input.workPublicId },
            type: 'admin_correction_created',
          },
          input.now,
        );
        const view = await this.findRevisionById(transaction, revision.id);
        if (view === null) throw new Error('ADMIN_CORRECTION_CREATE_READ_FAILED');
        return { outcome: 'created', revision: view };
      });
    } catch (error: unknown) {
      if (!this.isCorrectionIdempotencyConflict(error)) throw error;
      const replay = await this.resolveCorrectionReplay(
        this.database.sql,
        input.actorAccountId,
        input.idempotencyKey,
        requestFingerprint,
      );
      return (
        (await this.toCorrectionReplayResult(this.database.sql, replay)) ?? {
          outcome: 'idempotency_conflict',
        }
      );
    }
  }

  async submitRevision(
    input: Parameters<WorkRevisionRepository['submitRevision']>[0],
  ): Promise<WorkRevisionResult> {
    const payload = this.submitPayload(input);
    try {
      return await this.database.sql.begin(async (transaction) => {
        const initialReplay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'revision_submitted',
          payload,
        );
        const initialReplayResult = await this.toReplayResult(transaction, initialReplay);
        if (initialReplayResult !== null) return initialReplayResult;

        const draft = await this.lockOwnedDraft(
          transaction,
          input.actorAccountId,
          input.workPublicId,
        );
        if (draft === null) {
          const concurrentReplay = await this.resolveReplay(
            transaction,
            input.actorAccountId,
            input.idempotencyKey,
            'revision_submitted',
            payload,
          );
          const concurrentReplayResult = await this.toReplayResult(transaction, concurrentReplay);
          if (concurrentReplayResult !== null) return concurrentReplayResult;
          const work = await this.lockOwnedWork(
            transaction,
            input.actorAccountId,
            input.workPublicId,
          );
          if (work === null) return { outcome: 'not_found' };
          const pendingWithoutDraft = await transaction<Array<{ exists: boolean }>>`
            select exists(
              select 1 from private.work_revisions
              where work_id = ${work.work_id} and status = 'pending_review'
            ) as exists
          `;
          return this.required(pendingWithoutDraft[0]).exists
            ? { outcome: 'pending_revision_exists' }
            : { outcome: 'not_found' };
        }

        if (Number(draft.version) !== input.expectedDraftVersion) {
          return { outcome: 'draft_version_conflict' };
        }
        if (
          draft.base_published_revision_id !== input.expectedBasePublishedRevisionId ||
          draft.base_published_revision_id !== draft.published_revision_id
        ) {
          return { outcome: 'base_revision_conflict' };
        }
        const pending = await transaction<Array<{ exists: boolean }>>`
          select exists(
            select 1 from private.work_revisions
            where work_id = ${draft.work_id} and status = 'pending_review'
          ) as exists
        `;
        if (this.required(pending[0]).exists) return { outcome: 'pending_revision_exists' };

        const candidate = await this.loadCandidate(transaction, draft, input.submitterAttribution);
        const completeness = evaluateWorkRevisionCandidate(candidate);
        if (!completeness.isComplete) return { outcome: completeness.reason };

        const numberRows = await transaction<Array<{ next_number: string }>>`
          select (coalesce(max(revision_number), 0) + 1)::bigint as next_number
          from private.work_revisions where work_id = ${draft.work_id}
        `;
        const revisionNumber = Number(this.required(numberRows[0]).next_number);
        const inserted = await transaction<Array<{ id: string; public_id: string }>>`
          insert into private.work_revisions (
            work_id, revision_number, status, base_published_revision_id, draft_version,
            title, summary, description, category, academic_year, semester, submitted_at
          ) values (
            ${draft.work_id}, ${revisionNumber}, 'pending_review',
            ${draft.base_published_revision_id}, ${Number(draft.version)}, ${draft.title},
            ${draft.summary}, ${draft.description}, ${draft.category}, ${draft.academic_year},
            ${draft.semester}, ${input.now}
          ) returning id, public_id
        `;
        const revision = this.required(inserted[0]);
        await this.copySnapshot(transaction, revision.id, draft.work_id, candidate);
        await transaction`delete from private.work_drafts where work_id = ${draft.work_id}`;
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'revision_submitted',
          payload,
          resultingStatus: 'pending_review',
          resultingVersion: 1,
          revisionId: revision.id,
          workId: draft.work_id,
        });
        await this.emitEvent(
          transaction,
          revision.public_id,
          'work_revision_submitted',
          {
            revisionNumber,
            revisionPublicId: revision.public_id,
            workPublicId: input.workPublicId,
          },
          input.now,
        );
        const view = await this.findRevisionById(transaction, revision.id);
        if (view === null) throw new Error('WORK_REVISION_CREATE_READ_FAILED');
        return { outcome: 'created', revision: view };
      });
    } catch (error: unknown) {
      return this.resolveConcurrentReplay(
        error,
        input.actorAccountId,
        input.idempotencyKey,
        'revision_submitted',
        payload,
      );
    }
  }

  async withdrawRevision(
    input: Parameters<WorkRevisionRepository['withdrawRevision']>[0],
  ): Promise<WorkRevisionResult> {
    const payload = this.withdrawPayload(input);
    try {
      return await this.database.sql.begin(async (transaction) => {
        const work = await this.lockOwnedWork(
          transaction,
          input.actorAccountId,
          input.workPublicId,
        );
        if (work === null) return { outcome: 'not_found' };
        const replay = await this.resolveReplay(
          transaction,
          input.actorAccountId,
          input.idempotencyKey,
          'revision_withdrawn',
          payload,
        );
        const replayed = await this.toReplayResult(transaction, replay);
        if (replayed !== null) return replayed;

        const rows = await transaction<
          Array<{
            id: string;
            public_id: string;
            status: WorkRevisionView['status'];
            version: string;
          }>
        >`
          select id, public_id, status, version from private.work_revisions
          where work_id = ${work.work_id} and public_id = ${input.revisionPublicId}
          for update
        `;
        const revision = rows[0];
        if (revision === undefined) return { outcome: 'not_found' };
        if (Number(revision.version) !== input.expectedRevisionVersion) {
          return { outcome: 'revision_version_conflict' };
        }
        if (revision.status !== 'pending_review') return { outcome: 'invalid_transition' };

        await transaction`
          update private.work_revisions
          set status = 'withdrawn', withdrawn_at = ${input.now}, version = version + 1
          where id = ${revision.id}
        `;
        await this.seedDraftFromRevision(transaction, work.work_id, revision.id, input.now);
        await transaction`update public.works set updated_at = ${input.now} where id = ${work.work_id}`;
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'revision_withdrawn',
          payload,
          resultingStatus: 'withdrawn',
          resultingVersion: input.expectedRevisionVersion + 1,
          revisionId: revision.id,
          workId: work.work_id,
        });
        await this.emitEvent(
          transaction,
          revision.public_id,
          'work_revision_withdrawn',
          {
            revisionPublicId: revision.public_id,
            workPublicId: input.workPublicId,
          },
          input.now,
        );
        const view = await this.findRevisionById(transaction, revision.id);
        if (view === null) throw new Error('WORK_REVISION_WITHDRAW_READ_FAILED');
        return { outcome: 'withdrawn', revision: view };
      });
    } catch (error: unknown) {
      return this.resolveConcurrentReplay(
        error,
        input.actorAccountId,
        input.idempotencyKey,
        'revision_withdrawn',
        payload,
      );
    }
  }

  async findRevisionForReview(revisionPublicId: string): Promise<WorkRevisionView | null> {
    const revision = await this.findRevision(this.database.sql, 'public_id', revisionPublicId);
    return revision?.status === 'pending_review' ? revision : null;
  }

  async findPendingRevision(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<WorkRevisionView | null> {
    const rows = await this.database.sql<Array<{ revision_id: string }>>`
      select revision.id as revision_id
      from private.work_revisions as revision
      join public.works as work on work.id = revision.work_id
      join public.accounts as account on account.person_id = work.submitter_person_id
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
        and revision.status = 'pending_review'
      limit 1
    `;
    const row = rows[0];
    return row === undefined ? null : this.findRevisionById(this.database.sql, row.revision_id);
  }

  async listReviewQueue(input: {
    cursor: string | undefined;
    limit: number;
  }): Promise<ReviewQueuePage | { outcome: 'invalid_cursor' }> {
    const cursor = this.decodeCursor(input.cursor);
    if (input.cursor !== undefined && cursor === null) return { outcome: 'invalid_cursor' };
    const rows = await this.database.sql<
      Array<{
        academic_year: number;
        author_kind: WorkRevisionView['authorKind'];
        category: NormalizedWorkDraft['category'];
        id: string;
        public_id: string;
        revision_number: string;
        semester: NormalizedWorkDraft['academicPeriod']['semester'];
        submitted_at: Date;
        submitter_attribution_name: string;
        title: string;
        work_public_id: string;
      }>
    >`
      select revision.id, revision.public_id, revision.revision_number, revision.author_kind,
        revision.title,
        revision.category, revision.academic_year, revision.semester, revision.submitted_at,
        work.public_id as work_public_id,
        submitter.attribution_name as submitter_attribution_name
      from private.work_revisions as revision
      join public.works as work on work.id = revision.work_id
      join private.work_revision_attributions as submitter
        on submitter.revision_id = revision.id and submitter.position = 1
      where revision.status = 'pending_review'
        and ${
          cursor === null
            ? this.database.sql`true`
            : this.database
                .sql`(revision.submitted_at, revision.id) < (${cursor.submittedAt}, ${cursor.id}::uuid)`
        }
      order by revision.submitted_at desc, revision.id desc
      limit ${input.limit + 1}
    `;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => ({
        academicPeriod: { semester: row.semester, year: row.academic_year },
        authorKind: row.author_kind,
        category: row.category,
        number: Number(row.revision_number),
        revisionPublicId: row.public_id,
        submittedAt: row.submitted_at.toISOString(),
        submitterAttributionName: row.submitter_attribution_name,
        title: row.title,
        workPublicId: row.work_public_id,
      })),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? Buffer.from(JSON.stringify([last.submitted_at.toISOString(), last.id])).toString(
              'base64url',
            )
          : null,
    };
  }

  private async lockOwnedDraft(
    sql: postgres.TransactionSql,
    actorAccountId: string,
    workPublicId: string,
  ): Promise<LockedDraftRow | null> {
    const rows = await sql<LockedDraftRow[]>`
      select work.id as work_id, work.submitter_person_id, draft.base_published_revision_id,
        work.published_revision_id,
        draft.title, draft.summary, draft.description, draft.category, draft.academic_year,
        draft.semester, draft.version, student.entry_year, settings.current_academic_year
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      join public.students as student on student.person_id = account.person_id
      join public.account_roles as role on role.account_id = account.id and role.role = 'student'
      join public.academic_settings as settings on settings.singleton = true
      join private.work_drafts as draft on draft.work_id = work.id
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
        and account.status = 'active' and account.credential_state = 'set'
        and work.activity_state = 'active'
        and settings.current_academic_year between student.entry_year and student.access_ends_academic_year
      for update of work, draft
    `;
    return rows[0] ?? null;
  }

  private async lockOwnedWork(
    sql: postgres.TransactionSql,
    actorAccountId: string,
    workPublicId: string,
  ): Promise<LockedWorkRow | null> {
    const rows = await sql<LockedWorkRow[]>`
      select work.id as work_id
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      join public.students as student on student.person_id = account.person_id
      join public.account_roles as role on role.account_id = account.id and role.role = 'student'
      join public.academic_settings as settings on settings.singleton = true
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
        and account.status = 'active' and account.credential_state = 'set'
        and work.activity_state = 'active'
        and settings.current_academic_year between student.entry_year and student.access_ends_academic_year
      for update of work
    `;
    return rows[0] ?? null;
  }

  private async loadCandidate(
    sql: postgres.TransactionSql,
    draft: LockedDraftRow,
    submitterAttribution: Parameters<
      WorkRevisionRepository['submitRevision']
    >[0]['submitterAttribution'],
  ) {
    const [links, tags, videos, media, invitations] = await Promise.all([
      sql<NormalizedWorkDraft['links']>`
        select label, url from private.work_draft_links where work_id = ${draft.work_id}
        order by position
      `,
      sql<NormalizedWorkDraft['tags']>`
        select display_label as "displayLabel", normalized_identity as "normalizedIdentity"
        from private.work_draft_tags where work_id = ${draft.work_id} order by position
      `,
      sql<NormalizedWorkDraft['videoLinks']>`
        select provider, provider_video_id as "providerVideoId", url
        from private.work_draft_video_links where work_id = ${draft.work_id} order by position
      `,
      sql<
        Array<{
          assetId: string;
          kind: 'gallery' | 'poster';
          position: number;
          status: 'pending_upload' | 'processing' | 'ready' | 'rejected' | 'uploaded';
        }>
      >`
        select media.asset_id as "assetId", media.media_kind as kind, media.position, asset.status
        from private.work_draft_media as media
        join private.work_media_assets as asset on asset.id = media.asset_id
        where media.work_id = ${draft.work_id} order by media.media_kind desc, media.position
      `,
      sql<
        Array<{
          affiliation: string | null;
          attributionName: string | null;
          contributionRole: string | null;
          kind: 'account' | 'external';
          personId: string | null;
          state: RevisionInvitation['state'];
          studyYear: number | null;
        }>
      >`
        select kind, state, accepted_person_id as "personId", attribution_name as "attributionName",
          study_year as "studyYear", contribution_role as "contributionRole", affiliation
        from private.attribution_invitations
        where work_id = ${draft.work_id} and state in ('pending', 'accepted')
        order by created_at, id
      `,
    ]);
    const mappedInvitations: RevisionInvitation[] = invitations.map((invitation) => {
      if (invitation.state !== 'accepted') return { state: invitation.state };
      if (invitation.personId === null || invitation.attributionName === null) {
        throw new Error('ACCEPTED_ATTRIBUTION_INCOMPLETE');
      }
      return {
        affiliation: invitation.affiliation,
        attributionName: invitation.attributionName,
        contributionRole: invitation.contributionRole,
        kind: invitation.kind,
        personId: invitation.personId,
        state: 'accepted',
        studyYear: invitation.studyYear,
      };
    });
    return {
      academicRange: {
        currentAcademicYear: draft.current_academic_year,
        entryYear: draft.entry_year,
      },
      draft: {
        academicPeriod: { semester: draft.semester, year: draft.academic_year },
        category: draft.category,
        description: draft.description,
        links,
        summary: draft.summary,
        tags,
        title: draft.title,
        videoLinks: videos,
      },
      invitations: mappedInvitations,
      media,
      submitterAttribution,
    };
  }

  private async copySnapshot(
    sql: postgres.TransactionSql,
    revisionId: string,
    workId: string,
    candidate: Awaited<ReturnType<PostgresWorkRevisionsRepository['loadCandidate']>>,
  ): Promise<void> {
    for (const [index, link] of candidate.draft.links.entries()) {
      await sql`insert into private.work_revision_links (revision_id, position, label, url)
        values (${revisionId}, ${index + 1}, ${link.label}, ${link.url})`;
    }
    for (const [index, tag] of candidate.draft.tags.entries()) {
      await sql`insert into private.work_revision_tags (
        revision_id, position, display_label, normalized_identity
      ) values (${revisionId}, ${index + 1}, ${tag.displayLabel}, ${tag.normalizedIdentity})`;
    }
    for (const [index, video] of candidate.draft.videoLinks.entries()) {
      await sql`insert into private.work_revision_video_links (
        revision_id, position, provider, provider_video_id, url
      ) values (${revisionId}, ${index + 1}, ${video.provider}, ${video.providerVideoId}, ${video.url})`;
    }
    for (const media of candidate.media) {
      await sql`insert into private.work_revision_media (revision_id, media_kind, position, asset_id)
        values (${revisionId}, ${media.kind}, ${media.position}, ${media.assetId})`;
    }
    await sql`insert into private.work_revision_attributions (
      revision_id, position, kind, person_id, attribution_name, study_year
    ) values (
      ${revisionId}, 1, 'submitter',
      (select submitter_person_id from public.works where id = ${workId}),
      ${candidate.submitterAttribution.attributionName}, ${candidate.submitterAttribution.studyYear}
    )`;
    let position = 2;
    for (const invitation of candidate.invitations) {
      if (invitation.state !== 'accepted') continue;
      await sql`insert into private.work_revision_attributions (
        revision_id, position, kind, person_id, attribution_name, study_year,
        contribution_role, affiliation
      ) values (
        ${revisionId}, ${position}, ${invitation.kind}, ${invitation.personId},
        ${invitation.attributionName}, ${invitation.studyYear}, ${invitation.contributionRole},
        ${invitation.affiliation}
      )`;
      position += 1;
    }
  }

  private async copyCorrectionSnapshot(
    sql: postgres.TransactionSql,
    revisionId: string,
    baseRevisionId: string,
    candidate: NormalizedWorkDraft,
  ): Promise<void> {
    for (const [index, link] of candidate.links.entries()) {
      await sql`insert into private.work_revision_links (revision_id, position, label, url)
        values (${revisionId}, ${index + 1}, ${link.label}, ${link.url})`;
    }
    for (const [index, tag] of candidate.tags.entries()) {
      await sql`insert into private.work_revision_tags (
        revision_id, position, display_label, normalized_identity
      ) values (${revisionId}, ${index + 1}, ${tag.displayLabel}, ${tag.normalizedIdentity})`;
    }
    for (const [index, video] of candidate.videoLinks.entries()) {
      await sql`insert into private.work_revision_video_links (
        revision_id, position, provider, provider_video_id, url
      ) values (
        ${revisionId}, ${index + 1}, ${video.provider}, ${video.providerVideoId}, ${video.url}
      )`;
    }
    await sql`insert into private.work_revision_media (
      revision_id, media_kind, position, asset_id
    ) select ${revisionId}, media_kind, position, asset_id
      from private.work_revision_media where revision_id = ${baseRevisionId}`;
    await sql`insert into private.work_revision_attributions (
      revision_id, position, kind, person_id, attribution_name, study_year,
      contribution_role, affiliation
    ) select ${revisionId}, position, kind, person_id, attribution_name, study_year,
      contribution_role, affiliation
      from private.work_revision_attributions where revision_id = ${baseRevisionId}`;
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
      select ${workId}, position, label, url from private.work_revision_links where revision_id = ${revisionId}`;
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

  private findRevisionById(sql: Sql, revisionId: string): Promise<WorkRevisionView | null> {
    return this.findRevision(sql, 'id', revisionId);
  }

  private async findRevision(
    sql: Sql,
    identifier: 'id' | 'public_id',
    value: string,
  ): Promise<WorkRevisionView | null> {
    const identifierSql = identifier === 'id' ? sql`revision.id` : sql`revision.public_id`;
    const rows = await sql<RevisionRow[]>`
      select revision.id as revision_id, revision.public_id, revision.revision_number,
        revision.author_kind,
        revision.status, revision.base_published_revision_id, revision.title, revision.summary,
        revision.description, revision.category, revision.academic_year, revision.semester,
        revision.submitted_at, revision.withdrawn_at, revision.version,
        work.public_id as work_public_id,
        coalesce((select jsonb_agg(jsonb_build_object(
          'label', link.label, 'url', link.url
        ) order by link.position) from private.work_revision_links as link
          where link.revision_id = revision.id), '[]'::jsonb) as links,
        coalesce((select jsonb_agg(jsonb_build_object(
          'displayLabel', tag.display_label, 'normalizedIdentity', tag.normalized_identity
        ) order by tag.position) from private.work_revision_tags as tag
          where tag.revision_id = revision.id), '[]'::jsonb) as tags,
        coalesce((select jsonb_agg(jsonb_build_object(
          'provider', video.provider, 'providerVideoId', video.provider_video_id, 'url', video.url
        ) order by video.position) from private.work_revision_video_links as video
          where video.revision_id = revision.id), '[]'::jsonb) as video_links,
        coalesce((select jsonb_agg(jsonb_build_object(
          'kind', attribution.kind, 'attributionName', attribution.attribution_name,
          'studyYear', attribution.study_year, 'contributionRole', attribution.contribution_role,
          'affiliation', attribution.affiliation
        ) order by attribution.position) from private.work_revision_attributions as attribution
          where attribution.revision_id = revision.id), '[]'::jsonb) as attributions,
        coalesce((select jsonb_agg(jsonb_build_object(
          'assetId', media.asset_id, 'kind', media.media_kind, 'position', media.position,
          'width', asset.width, 'height', asset.height, 'dominantColor', asset.dominant_color,
          'variants', coalesce((select jsonb_agg(jsonb_build_object(
            'width', variant.width, 'height', variant.height
          ) order by variant.width) from private.work_media_variants as variant
            where variant.asset_id = media.asset_id), '[]'::jsonb)
        ) order by media.media_kind desc, media.position)
          from private.work_revision_media as media
          join private.work_media_assets as asset on asset.id = media.asset_id
          where media.revision_id = revision.id), '[]'::jsonb) as media
      from private.work_revisions as revision
      join public.works as work on work.id = revision.work_id
      where ${identifierSql} = ${value}
      limit 1
    `;
    const row = rows[0];
    return row === undefined ? null : this.mapRevision(row);
  }

  private mapRevision(row: RevisionRow): WorkRevisionView {
    return {
      authorKind: row.author_kind,
      attributions: row.attributions,
      content: {
        academicPeriod: { semester: row.semester, year: row.academic_year },
        category: row.category,
        description: row.description,
        links: row.links,
        summary: row.summary,
        tags: row.tags,
        title: row.title,
        videoLinks: row.video_links,
      },
      media: row.media,
      number: Number(row.revision_number),
      publicId: row.public_id,
      status: row.status,
      submittedAt: row.submitted_at.toISOString(),
      version: Number(row.version),
      withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
      workPublicId: row.work_public_id,
    };
  }

  private async resolveReplay(
    sql: Sql,
    actorAccountId: string,
    idempotencyKey: string,
    operation: Operation,
    payload: postgres.JSONValue,
  ): Promise<ReplayResolution> {
    const rows = await sql<OperationRow[]>`
      select revision_id, (
        actor_account_id = ${actorAccountId} and operation = ${operation}
        and request_payload = ${sql.json(payload)}
      ) as is_equivalent
      from private.work_revision_operations where idempotency_key = ${idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return { outcome: 'none' };
    return row.is_equivalent
      ? { outcome: 'replay', revisionId: row.revision_id }
      : { outcome: 'conflict' };
  }

  private async resolveCorrectionReplay(
    sql: Sql,
    actorAccountId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<CorrectionReplayResolution> {
    const rows = await sql<Array<{ is_equivalent: boolean; revision_id: string }>>`
      select revision_id, (
        actor_account_id = ${actorAccountId}
        and request_fingerprint = ${requestFingerprint}
      ) as is_equivalent
      from private.admin_correction_audits where idempotency_key = ${idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return { outcome: 'none' };
    return row.is_equivalent
      ? { outcome: 'replay', revisionId: row.revision_id }
      : { outcome: 'conflict' };
  }

  private async toCorrectionReplayResult(
    sql: Sql,
    replay: CorrectionReplayResolution,
  ): Promise<AdminCorrectionResult | null> {
    if (replay.outcome === 'none') return null;
    if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
    const revision = await this.findRevisionById(sql, replay.revisionId);
    return revision === null ? { outcome: 'not_found' } : { outcome: 'replayed', revision };
  }

  private isCorrectionIdempotencyConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505' &&
      'constraint_name' in error &&
      error.constraint_name === 'admin_correction_audits_idempotency_key_key'
    );
  }

  private async toReplayResult(
    sql: Sql,
    replay: ReplayResolution,
  ): Promise<WorkRevisionResult | null> {
    if (replay.outcome === 'none') return null;
    if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
    const revision = await this.findRevisionById(sql, replay.revisionId);
    return revision === null ? { outcome: 'not_found' } : { outcome: 'replayed', revision };
  }

  private async resolveConcurrentReplay(
    error: unknown,
    actorAccountId: string,
    idempotencyKey: string,
    operation: Operation,
    payload: postgres.JSONValue,
  ): Promise<WorkRevisionResult> {
    if (!this.isOperationConflict(error)) throw error;
    const replay = await this.resolveReplay(
      this.database.sql,
      actorAccountId,
      idempotencyKey,
      operation,
      payload,
    );
    return (
      (await this.toReplayResult(this.database.sql, replay)) ?? {
        outcome: 'idempotency_conflict',
      }
    );
  }

  private isOperationConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505' &&
      'constraint_name' in error &&
      error.constraint_name === 'work_revision_operations_pkey'
    );
  }

  private async recordOperation(
    sql: Sql,
    input: {
      actorAccountId: string;
      idempotencyKey: string;
      now: Date;
      operation: Operation;
      payload: postgres.JSONValue;
      resultingStatus: 'pending_review' | 'withdrawn';
      resultingVersion: number;
      revisionId: string;
      workId: string;
    },
  ): Promise<void> {
    await sql`insert into private.work_revision_operations (
      idempotency_key, actor_account_id, work_id, revision_id, operation, request_payload,
      resulting_status, resulting_version, occurred_at
    ) values (
      ${input.idempotencyKey}, ${input.actorAccountId}, ${input.workId}, ${input.revisionId},
      ${input.operation}, ${sql.json(input.payload)}, ${input.resultingStatus},
      ${input.resultingVersion}, ${input.now}
    )`;
  }

  private async emitEvent(
    sql: Sql,
    revisionPublicId: string,
    eventType: string,
    payload: postgres.JSONValue,
    now: Date,
  ): Promise<void> {
    await sql`insert into private.outbox_events (
      aggregate_type, aggregate_id, event_type, payload, occurred_at
    ) values ('work_revision', ${revisionPublicId}, ${eventType}, ${sql.json(payload)}, ${now})
    on conflict (aggregate_type, aggregate_id, event_type) do nothing`;
  }

  private submitPayload(
    input: Parameters<WorkRevisionRepository['submitRevision']>[0],
  ): postgres.JSONValue {
    return {
      expectedBasePublishedRevisionId: input.expectedBasePublishedRevisionId,
      expectedDraftVersion: input.expectedDraftVersion,
      submitterAttribution: {
        attributionName: input.submitterAttribution.attributionName,
        studyYear: input.submitterAttribution.studyYear,
      },
      workPublicId: input.workPublicId,
    };
  }

  private withdrawPayload(
    input: Parameters<WorkRevisionRepository['withdrawRevision']>[0],
  ): postgres.JSONValue {
    return {
      expectedRevisionVersion: input.expectedRevisionVersion,
      revisionPublicId: input.revisionPublicId,
      workPublicId: input.workPublicId,
    };
  }

  private correctionFingerprint(
    input: Parameters<AdminCorrectionsRepository['createCorrection']>[0],
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          candidate: input.candidate,
          diff: input.diff,
          expectedPublishedRevisionId: input.expectedPublishedRevisionId,
          expectedRevisionVersion: input.expectedRevisionVersion,
          reason: input.reason,
          workPublicId: input.workPublicId,
        }),
      )
      .digest('hex');
  }

  private decodeCursor(cursor?: string): { id: string; submittedAt: Date } | null {
    if (cursor === undefined) return null;
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        typeof value[0] !== 'string' ||
        typeof value[1] !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          value[1],
        )
      )
        return null;
      const submittedAt = new Date(value[0]);
      return Number.isNaN(submittedAt.getTime()) ? null : { id: value[1], submittedAt };
    } catch {
      return null;
    }
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('WORK_REVISION_PERSISTENCE_INVARIANT');
    return value;
  }
}
