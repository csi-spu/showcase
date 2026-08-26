import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  AttributionRemovalRepository,
  AttributionRemovalRequestView,
  AttributionRemovalResult,
} from '../application/attribution-removal.ports';

type Sql = postgres.Sql | postgres.TransactionSql;

interface RemovalRow {
  attribution_name: string;
  correction_revision_public_id: string | null;
  created_at: Date;
  id: string;
  invitation_id: string;
  person_id: string;
  public_id: string;
  reason: string;
  revision_id: string;
  revision_public_id: string;
  state: AttributionRemovalRequestView['state'];
  version: string;
  work_id: string;
  work_public_id: string;
}

@Injectable()
export class PostgresAttributionRemovalRepository implements AttributionRemovalRepository {
  constructor(private readonly database: DatabaseClient) {}

  async create(
    input: Parameters<AttributionRemovalRepository['create']>[0],
  ): Promise<AttributionRemovalResult> {
    const payload = { reason: input.reason };
    try {
      return await this.database.sql.begin(async (sql) => {
        const replay = await this.replay(sql, input.idempotencyKey, null, 'created', payload);
        if (replay !== null) return replay;
        const targets = await sql<RemovalRow[]>`
          select invitation.id as invitation_id, invitation.accepted_person_id as person_id,
            attribution.attribution_name, work.id as work_id, work.public_id as work_public_id,
            revision.id as revision_id, revision.public_id as revision_public_id
          from private.attribution_invitation_sessions as session
          join private.attribution_invitations as invitation on invitation.id = session.invitation_id
          join public.works as work on work.id = invitation.work_id
          join private.work_revisions as revision on revision.id = work.published_revision_id
          join private.work_revision_attributions as attribution
            on attribution.revision_id = revision.id
            and attribution.person_id = invitation.accepted_person_id
            and attribution.kind = 'external'
          where session.session_hash = ${input.invitationSessionHash}
            and session.revoked_at is null and session.expires_at > ${input.now}
            and invitation.kind = 'external' and invitation.state = 'accepted'
            and work.activity_state = 'active' and work.publication_state = 'published'
          for update of work
        `;
        const target = targets[0];
        if (target === undefined) return { outcome: 'not_found' };
        const inserted = await sql<RemovalRow[]>`
          insert into private.attribution_removal_requests (
            invitation_id, work_id, revision_id, reason, created_at
          ) values (
            ${target.invitation_id}, ${target.work_id}, ${target.revision_id}, ${input.reason}, ${input.now}
          ) returning id, public_id, invitation_id, work_id, revision_id, state, reason,
            version, created_at, ${target.person_id}::uuid as person_id,
            ${target.attribution_name}::text as attribution_name,
            ${target.work_public_id}::uuid as work_public_id,
            ${target.revision_public_id}::uuid as revision_public_id,
            null::uuid as correction_revision_public_id
        `;
        const request = this.required(inserted[0]);
        await this.operation(
          sql,
          request.id,
          null,
          input.idempotencyKey,
          'created',
          payload,
          'pending',
          1,
          input.now,
        );
        return { outcome: 'created', request: this.map(request) };
      });
    } catch (error: unknown) {
      if (!this.isUnique(error)) throw error;
      return (
        (await this.replay(this.database.sql, input.idempotencyKey, null, 'created', payload)) ?? {
          outcome: 'request_state_conflict',
        }
      );
    }
  }

  findCurrent(invitationSessionHash: string, now: Date) {
    return this.rows(
      this.database.sql,
      this.database.sql`
      request.state = 'pending' and exists (
        select 1 from private.attribution_invitation_sessions as session
        where session.invitation_id = request.invitation_id
          and session.session_hash = ${invitationSessionHash}
          and session.revoked_at is null and session.expires_at > ${now}
      )
    `,
    ).then((rows) => (rows[0] === undefined ? null : this.map(rows[0])));
  }

  listPending(limit: number) {
    return this.rows(this.database.sql, this.database.sql`request.state = 'pending'`, limit).then(
      (rows) => rows.map((row) => this.map(row)),
    );
  }

  async decide(
    input: Parameters<AttributionRemovalRepository['decide']>[0],
  ): Promise<AttributionRemovalResult> {
    const operation = input.decision === 'accept' ? 'accepted' : 'declined';
    const payload = {
      decision: input.decision,
      decisionReason: input.decisionReason,
      expectedVersion: input.expectedVersion,
    };
    try {
      return await this.database.sql.begin(async (sql) => {
        const replay = await this.replay(
          sql,
          input.idempotencyKey,
          input.actorAccountId,
          operation,
          payload,
        );
        if (replay !== null) return replay;
        const rows = await this.rows(sql, sql`request.public_id = ${input.requestPublicId}`, 1);
        const candidate = rows[0];
        if (candidate === undefined) return { outcome: 'not_found' };
        const work = await sql<
          Array<{
            activity_state: string;
            publication_state: string;
            published_revision_id: string | null;
            submitter_account_id: string;
            title: string;
          }>
        >`
          select work.activity_state, work.publication_state, work.published_revision_id,
            account.id as submitter_account_id, revision.title
          from public.works as work
          join public.accounts as account on account.person_id = work.submitter_person_id
          join private.work_revisions as revision on revision.id = ${candidate.revision_id}
          where work.id = ${candidate.work_id} for update of work
        `;
        const current = work[0];
        if (current === undefined) return { outcome: 'not_found' };
        const lockedRows = await this.rows(
          sql,
          sql`request.public_id = ${input.requestPublicId}`,
          1,
          true,
        );
        const request = lockedRows[0];
        if (request === undefined) return { outcome: 'not_found' };
        if (Number(request.version) !== input.expectedVersion)
          return { outcome: 'version_conflict' };
        if (request.state !== 'pending') return { outcome: 'request_state_conflict' };

        let correctionRevisionId: string | null = null;
        let correctionRevisionPublicId: string | null = null;
        if (input.decision === 'accept') {
          if (
            current.activity_state !== 'active' ||
            current.publication_state !== 'published' ||
            current.published_revision_id !== request.revision_id
          ) {
            return { outcome: 'work_state_conflict' };
          }
          const pending = await sql<Array<{ exists: boolean }>>`
            select exists(select 1 from private.work_revisions where work_id = ${request.work_id} and status = 'pending_review') as exists
          `;
          if (this.required(pending[0]).exists) return { outcome: 'pending_revision_exists' };
          const revisions = await sql<Array<{ id: string; public_id: string }>>`
            insert into private.work_revisions (
              work_id, revision_number, status, base_published_revision_id, draft_version,
              author_kind, title, summary, description, category, academic_year, semester, submitted_at
            ) select revision.work_id,
              (select max(other.revision_number) + 1 from private.work_revisions as other where other.work_id = revision.work_id),
              'pending_review', revision.id, null, 'admin_correction', revision.title,
              revision.summary, revision.description, revision.category, revision.academic_year,
              revision.semester, ${input.now}
            from private.work_revisions as revision where revision.id = ${request.revision_id}
            returning id, public_id
          `;
          const correction = this.required(revisions[0]);
          correctionRevisionId = correction.id;
          correctionRevisionPublicId = correction.public_id;
          await this.copySnapshot(sql, request.revision_id, correction.id, request.person_id);
          await sql`
            insert into private.admin_correction_audits (
              idempotency_key, actor_account_id, work_id, base_revision_id, revision_id,
              reason, diff_metadata, request_fingerprint, occurred_at
            ) values (
              ${input.idempotencyKey}, ${input.actorAccountId}, ${request.work_id},
              ${request.revision_id}, ${correction.id}, ${request.reason},
              ${sql.json({ categories: ['attribution'], fields: ['attributions'] })},
              ${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}, ${input.now}
            )
          `;
          await sql`
            insert into private.outbox_events (aggregate_type, aggregate_id, event_type, payload, occurred_at)
            values ('attribution_removal_request', ${request.public_id}, 'attribution_removal_correction_created',
              ${sql.json({ audience: 'student', parameters: { title: current.title }, recipientAccountIds: [current.submitter_account_id], target: { kind: 'work', workPublicId: request.work_public_id }, type: 'attribution_removal_correction_created' })}, ${input.now})
          `;
        }
        const updated = await sql<RemovalRow[]>`
          update private.attribution_removal_requests set state = ${operation},
            decision_reason = ${input.decisionReason}, decided_by_account_id = ${input.actorAccountId},
            correction_revision_id = ${correctionRevisionId}, resolved_at = ${input.now}, version = version + 1
          where id = ${request.id}
          returning id, public_id, invitation_id, work_id, revision_id, state, reason,
            version, created_at, ${request.person_id}::uuid as person_id,
            ${request.attribution_name}::text as attribution_name,
            ${request.work_public_id}::uuid as work_public_id,
            ${request.revision_public_id}::uuid as revision_public_id,
            ${correctionRevisionPublicId}::uuid as correction_revision_public_id
        `;
        const resolved = this.required(updated[0]);
        await this.operation(
          sql,
          request.id,
          input.actorAccountId,
          input.idempotencyKey,
          operation,
          payload,
          operation,
          Number(resolved.version),
          input.now,
        );
        return { outcome: 'resolved', request: this.map(resolved) };
      });
    } catch (error: unknown) {
      if (!this.isUnique(error)) throw error;
      return (
        (await this.replay(
          this.database.sql,
          input.idempotencyKey,
          input.actorAccountId,
          operation,
          payload,
        )) ?? { outcome: 'idempotency_conflict' }
      );
    }
  }

  private rows(
    sql: Sql,
    condition: postgres.PendingQuery<postgres.Row[]>,
    limit = 20,
    isLocked = false,
  ) {
    return sql<RemovalRow[]>`
      select request.id, request.public_id, request.invitation_id, request.work_id,
        request.revision_id, request.state, request.reason, request.version, request.created_at,
        invitation.accepted_person_id as person_id, attribution.attribution_name,
        work.public_id as work_public_id, revision.public_id as revision_public_id,
        correction.public_id as correction_revision_public_id
      from private.attribution_removal_requests as request
      join private.attribution_invitations as invitation on invitation.id = request.invitation_id
      join public.works as work on work.id = request.work_id
      join private.work_revisions as revision on revision.id = request.revision_id
      join private.work_revision_attributions as attribution on attribution.revision_id = revision.id and attribution.person_id = invitation.accepted_person_id
      left join private.work_revisions as correction on correction.id = request.correction_revision_id
      where ${condition}
      order by request.created_at, request.id limit ${limit}
      ${isLocked ? sql`for update of request` : sql``}
    `;
  }

  private async copySnapshot(
    sql: postgres.TransactionSql,
    baseId: string,
    revisionId: string,
    removedPersonId: string,
  ) {
    await sql`insert into private.work_revision_links select ${revisionId}, position, label, url from private.work_revision_links where revision_id = ${baseId}`;
    await sql`insert into private.work_revision_tags select ${revisionId}, position, display_label, normalized_identity from private.work_revision_tags where revision_id = ${baseId}`;
    await sql`insert into private.work_revision_video_links select ${revisionId}, position, provider, provider_video_id, url from private.work_revision_video_links where revision_id = ${baseId}`;
    await sql`insert into private.work_revision_media select ${revisionId}, media_kind, position, asset_id from private.work_revision_media where revision_id = ${baseId}`;
    await sql`insert into private.work_revision_attributions
      select ${revisionId}, position, kind, person_id, attribution_name, study_year, contribution_role, affiliation
      from private.work_revision_attributions where revision_id = ${baseId} and person_id <> ${removedPersonId}`;
  }

  private async operation(
    sql: postgres.TransactionSql,
    requestId: string,
    actorId: string | null,
    key: string,
    operation: string,
    payload: postgres.JSONValue,
    state: string,
    version: number,
    now: Date,
  ) {
    await sql`insert into private.attribution_removal_operations
      (idempotency_key, request_id, actor_account_id, operation, request_payload, resulting_state, resulting_version, occurred_at)
      values (${key}, ${requestId}, ${actorId}, ${operation}, ${sql.json(payload)}, ${state}, ${version}, ${now})`;
  }

  private async replay(
    sql: Sql,
    key: string,
    actorId: string | null,
    operation: string,
    payload: postgres.JSONValue,
  ): Promise<AttributionRemovalResult | null> {
    const operations = await sql<Array<{ equivalent: boolean; request_id: string }>>`
      select request_id, (actor_account_id is not distinct from ${actorId} and operation = ${operation} and request_payload = ${sql.json(payload)}) as equivalent
      from private.attribution_removal_operations where idempotency_key = ${key}
    `;
    const found = operations[0];
    if (found === undefined) return null;
    if (!found.equivalent) return { outcome: 'idempotency_conflict' };
    const rows = await this.rows(sql, sql`request.id = ${found.request_id}`, 1);
    return rows[0] === undefined
      ? { outcome: 'not_found' }
      : { outcome: 'replayed', request: this.map(rows[0]) };
  }

  private map(row: RemovalRow): AttributionRemovalRequestView {
    return {
      attributionName: row.attribution_name,
      correctionRevisionPublicId: row.correction_revision_public_id,
      createdAt: row.created_at.toISOString(),
      publicId: row.public_id,
      reason: row.reason,
      revisionPublicId: row.revision_public_id,
      state: row.state,
      version: Number(row.version),
      workPublicId: row.work_public_id,
    };
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('ATTRIBUTION_REMOVAL_READ_FAILED');
    return value;
  }
  private isUnique(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
}
