import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import { refreshPublicWorkCatalog } from '../../catalog/infrastructure/postgres-catalog-projection';
import type {
  AttributionRemovalDecisionResult,
  AttributionRemovalRepository,
  AttributionRemovalRequestView,
} from '../application/attribution-removal.ports';

type Sql = postgres.Sql;
const RATE_LIMIT = 5;
const RATE_WINDOW_MILLISECONDS = 60 * 60 * 1_000;

interface RemovalRow {
  attribution_name: string;
  attribution_public_id: string;
  correction_revision_public_id: string | null;
  created_at: Date;
  current_published_revision_public_id: string | null;
  current_published_revision_version: string | null;
  id: string;
  kind: 'account' | 'external';
  person_id: string;
  public_id: string;
  reason: string;
  revision_id: string;
  revision_public_id: string;
  state: AttributionRemovalRequestView['state'];
  version: string;
  work_id: string;
  work_public_id: string;
  work_title: string;
}

@Injectable()
export class PostgresAttributionRemovalRepository implements AttributionRemovalRepository {
  constructor(private readonly database: DatabaseClient) {}

  async createPublic(
    input: Parameters<AttributionRemovalRepository['createPublic']>[0],
  ): ReturnType<AttributionRemovalRepository['createPublic']> {
    const payload = {
      attributionPublicId: input.attributionPublicId,
      reason: input.reason,
      workPublicId: input.workPublicId,
    };
    return this.database.sql.begin(async (sql) => {
      await sql`select 1 from (select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}::text, 0))) as advisory_lock`;
      const replay = await this.createReplay(sql, input.idempotencyKey, payload);
      if (replay !== null) return replay;
      if (!(await this.consumeRateLimit(sql, input.now, 'source', input.sourceKeyHash))) {
        return { outcome: 'rate_limited' };
      }
      const targets = await sql<RemovalRow[]>`
        select work.id as work_id, work.public_id as work_public_id,
          revision.id as revision_id, revision.public_id as revision_public_id,
          attribution.attribution_public_id, attribution.attribution_name,
          attribution.person_id, attribution.kind
        from public.works as work
        join private.work_revisions as revision on revision.id = work.published_revision_id
        join private.work_revision_attributions as attribution
          on attribution.revision_id = revision.id
        where work.public_id = ${input.workPublicId}
          and work.activity_state = 'active' and work.publication_state = 'published'
          and revision.status = 'approved'
          and attribution.attribution_public_id = ${input.attributionPublicId}
          and attribution.kind in ('account', 'external')
        limit 1
      `;
      const target = targets[0];
      if (target === undefined) return { outcome: 'not_found' };
      if (!(await this.consumeRateLimit(sql, input.now, 'target', input.targetKeyHash))) {
        return { outcome: 'rate_limited' };
      }
      const existing = await sql<
        Array<{ id: string; state: 'accepted' | 'declined' | 'pending'; version: string }>
      >`
        select id, state, version from private.attribution_removal_requests
        where attribution_public_id = ${input.attributionPublicId} limit 1
      `;
      let existingRequest = existing[0];
      let requestId = existingRequest?.id;
      if (requestId === undefined) {
        const inserted = await sql<Array<{ id: string }>>`
          insert into private.attribution_removal_requests (
            invitation_id, attribution_public_id, work_id, revision_id, reason, created_at
          ) values (
            null, ${input.attributionPublicId}, ${target.work_id}, ${target.revision_id},
            ${input.reason}, ${input.now}
          ) returning id
        `;
        requestId = this.required(inserted[0]).id;
        existingRequest = { id: requestId, state: 'pending', version: '1' };
      }
      await this.operation(sql, {
        actorAccountId: null,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: 'created',
        payload,
        requestId,
        resultingState: this.required(existingRequest).state,
        resultingVersion: Number(this.required(existingRequest).version),
      });
      return { outcome: 'created' };
    });
  }

  async listPending(
    input: Parameters<AttributionRemovalRepository['listPending']>[0],
  ): ReturnType<AttributionRemovalRepository['listPending']> {
    const cursor = this.decodeCursor(input.cursor);
    if (cursor === 'invalid') return { outcome: 'invalid_cursor' };
    const rows = await this.rows(
      this.database.sql,
      this.database.sql`
        request.state = 'pending' and (
          ${cursor?.createdAt ?? null}::timestamptz is null
          or (request.created_at, request.id) > (
            ${cursor?.createdAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid
          )
        )
      `,
      input.limit + 1,
    );
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => this.map(row)),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? Buffer.from(JSON.stringify([last.created_at.toISOString(), last.id])).toString(
              'base64url',
            )
          : null,
    };
  }

  decline(
    input: Parameters<AttributionRemovalRepository['decline']>[0],
  ): Promise<AttributionRemovalDecisionResult> {
    const payload = {
      decisionReason: input.decisionReason,
      expectedRequestVersion: input.expectedRequestVersion,
    };
    return this.database.sql.begin(async (sql) => {
      await sql`select 1 from (select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}::text, 0))) as advisory_lock`;
      const replay = await this.decisionReplay(sql, input, 'declined', payload);
      if (replay !== null) return replay;
      const request = await this.lockRequest(sql, input.requestPublicId);
      if (request === null) return { outcome: 'not_found' };
      if (Number(request.version) !== input.expectedRequestVersion) {
        return { outcome: 'version_conflict' };
      }
      if (request.state !== 'pending') return { outcome: 'request_state_conflict' };
      const updated = await sql<RemovalRow[]>`
        update private.attribution_removal_requests as request
        set state = 'declined', decision_reason = ${input.decisionReason},
          decided_by_account_id = ${input.actorAccountId}, resolved_at = ${input.now},
          version = version + 1
        where request.id = ${request.id}
        returning ${this.returning(sql, request)}
      `;
      const resolved = this.required(updated[0]);
      await this.operation(sql, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: 'declined',
        payload,
        requestId: request.id,
        resultingState: 'declined',
        resultingVersion: Number(resolved.version),
      });
      return { outcome: 'resolved', request: this.map(resolved) };
    });
  }

  approveAndPublish(
    input: Parameters<AttributionRemovalRepository['approveAndPublish']>[0],
  ): Promise<AttributionRemovalDecisionResult> {
    const payload = {
      expectedPublishedRevisionPublicId: input.expectedPublishedRevisionPublicId,
      expectedPublishedRevisionVersion: input.expectedPublishedRevisionVersion,
      expectedRequestVersion: input.expectedRequestVersion,
    };
    return this.database.sql.begin(async (sql) => {
      await sql`select 1 from (select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}::text, 0))) as advisory_lock`;
      const replay = await this.decisionReplay(sql, input, 'accepted', payload);
      if (replay !== null) return replay;
      const request = await this.lockRequest(sql, input.requestPublicId);
      if (request === null) return { outcome: 'not_found' };
      if (Number(request.version) !== input.expectedRequestVersion) {
        return { outcome: 'version_conflict' };
      }
      if (request.state !== 'pending') return { outcome: 'request_state_conflict' };
      const works = await sql<
        Array<{
          activity_state: string;
          publication_state: string;
          published_revision_id: string | null;
          revision_public_id: string;
          revision_version: string;
          submitter_account_id: string;
          title: string;
          work_version: string;
        }>
      >`
        select work.activity_state, work.publication_state, work.published_revision_id,
          work.version as work_version, revision.public_id as revision_public_id,
          revision.version as revision_version, revision.title,
          account.id as submitter_account_id
        from public.works as work
        join private.work_revisions as revision on revision.id = work.published_revision_id
        join public.accounts as account on account.person_id = work.submitter_person_id
        where work.id = ${request.work_id}
        for update of work, revision
      `;
      const work = works[0];
      if (
        work === undefined ||
        work.activity_state !== 'active' ||
        work.publication_state !== 'published'
      )
        return { outcome: 'work_state_conflict' };
      if (
        work.published_revision_id !== request.revision_id ||
        work.revision_public_id !== input.expectedPublishedRevisionPublicId ||
        Number(work.revision_version) !== input.expectedPublishedRevisionVersion
      )
        return { outcome: 'pointer_conflict' };
      const pending = await sql<Array<{ exists: boolean }>>`
        select exists(select 1 from private.work_revisions
          where work_id = ${request.work_id} and status = 'pending_review') as exists
      `;
      if (this.required(pending[0]).exists) return { outcome: 'pending_revision_exists' };

      const revisionRows = await sql<
        Array<{ id: string; public_id: string; revision_number: string }>
      >`
        insert into private.work_revisions (
          work_id, revision_number, status, base_published_revision_id, draft_version,
          author_kind, title, summary, description, category, academic_year, semester,
          version, submitted_at
        ) select base.work_id,
          (select coalesce(max(other.revision_number), 0) + 1 from private.work_revisions as other
            where other.work_id = base.work_id),
          'approved', base.id, null, 'admin_correction', base.title, base.summary,
          base.description, base.category, base.academic_year, base.semester, 2, ${input.now}
        from private.work_revisions as base where base.id = ${request.revision_id}
        returning id, public_id, revision_number
      `;
      const correction = this.required(revisionRows[0]);
      await this.copySnapshot(sql, request, correction.id);
      await sql`
        insert into private.reviews (
          revision_id, actor_account_id, decision, reason, feedback,
          expected_revision_version, resulting_revision_version, idempotency_key,
          request_payload, reviewed_at
        ) values (
          ${correction.id}, ${input.actorAccountId}, 'approved', null, null,
          1, 2, ${input.idempotencyKey}, ${sql.json(payload)}, ${input.now}
        )
      `;
      await sql`
        insert into private.admin_correction_audits (
          idempotency_key, actor_account_id, work_id, base_revision_id, revision_id,
          reason, diff_metadata, request_fingerprint, occurred_at
        ) values (
          ${input.idempotencyKey}, ${input.actorAccountId}, ${request.work_id},
          ${request.revision_id}, ${correction.id}, ${request.reason},
          ${sql.json({ categories: ['attribution'], fields: ['attributions'], removedAttributionPublicId: request.attribution_public_id })},
          ${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}, ${input.now}
        )
      `;
      await sql`
        update public.works set published_revision_id = ${correction.id},
          publication_state = 'published', version = version + 1, updated_at = ${input.now}
        where id = ${request.work_id}
      `;
      const updated = await sql<RemovalRow[]>`
        update private.attribution_removal_requests as target_request
        set state = 'accepted', decided_by_account_id = ${input.actorAccountId},
          correction_revision_id = ${correction.id}, resolved_at = ${input.now}, version = version + 1
        where target_request.id = ${request.id}
        returning ${this.returning(sql, {
          ...request,
          correction_revision_public_id: correction.public_id,
          current_published_revision_public_id: correction.public_id,
          current_published_revision_version: '2',
        })}
      `;
      const resolved = this.required(updated[0]);
      await this.operation(sql, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: 'accepted',
        payload,
        requestId: request.id,
        resultingState: 'accepted',
        resultingVersion: Number(resolved.version),
      });
      await refreshPublicWorkCatalog(sql, request.work_id, input.now);
      await this.emitPublicationEvents(sql, request, correction, input.now);
      return { outcome: 'resolved', request: this.map(resolved) };
    });
  }

  private async copySnapshot(
    sql: postgres.TransactionSql,
    request: RemovalRow,
    correctionId: string,
  ) {
    await sql`insert into private.work_revision_links
      select ${correctionId}, position, label, url from private.work_revision_links
      where revision_id = ${request.revision_id}`;
    await sql`insert into private.work_revision_tags
      select ${correctionId}, position, display_label, normalized_identity
      from private.work_revision_tags where revision_id = ${request.revision_id}`;
    await sql`insert into private.work_revision_video_links
      select ${correctionId}, position, provider, provider_video_id, url
      from private.work_revision_video_links where revision_id = ${request.revision_id}`;
    await sql`insert into private.work_revision_media
      select ${correctionId}, media_kind, position, asset_id
      from private.work_revision_media where revision_id = ${request.revision_id}`;
    await sql`insert into private.work_revision_attributions (
      revision_id, position, kind, person_id, attribution_name, study_year,
      contribution_role, affiliation, attribution_model_version
    ) select ${correctionId}, position, kind, person_id, attribution_name, study_year,
      contribution_role, affiliation, attribution_model_version
      from private.work_revision_attributions
      where revision_id = ${request.revision_id}
        and attribution_public_id <> ${request.attribution_public_id}`;
    await sql`insert into private.published_revision_tags (revision_id, tag_id, position)
      select ${correctionId}, tag_id, position from private.published_revision_tags
      where revision_id = ${request.revision_id}`;
  }

  private async emitPublicationEvents(
    sql: postgres.TransactionSql,
    request: RemovalRow,
    correction: { public_id: string },
    now: Date,
  ) {
    await sql`insert into private.outbox_events (
      aggregate_type, aggregate_id, event_type, payload, occurred_at
    ) values (
      'work_revision', ${correction.public_id}, 'work_revision_published',
      ${sql.json({
        cacheTargets: { workPublicId: request.work_public_id },
      })}, ${now}
    )`;
  }

  private rows(sql: Sql, condition: postgres.PendingQuery<postgres.Row[]>, limit = 20) {
    return sql<RemovalRow[]>`
      select request.id, request.public_id, request.work_id, request.revision_id,
        request.state, request.reason, request.version, request.created_at,
        request.attribution_public_id, attribution.attribution_name,
        attribution.person_id, attribution.kind, work.public_id as work_public_id,
        revision.public_id as revision_public_id,
        revision.title as work_title,
        correction.public_id as correction_revision_public_id,
        current_revision.public_id as current_published_revision_public_id,
        current_revision.version as current_published_revision_version
      from private.attribution_removal_requests as request
      join private.work_revision_attributions as attribution
        on attribution.attribution_public_id = request.attribution_public_id
      join public.works as work on work.id = request.work_id
      join private.work_revisions as revision on revision.id = request.revision_id
      left join private.work_revisions as correction on correction.id = request.correction_revision_id
      left join private.work_revisions as current_revision on current_revision.id = work.published_revision_id
      where ${condition}
      order by request.created_at, request.id limit ${limit}
    `;
  }

  private async lockRequest(sql: postgres.TransactionSql, publicId: string) {
    const locked = await sql<Array<{ id: string }>>`
      select id from private.attribution_removal_requests
      where public_id = ${publicId} for update`;
    if (locked[0] === undefined) return null;
    const rows = await this.rows(sql, sql`request.public_id = ${publicId}`, 1);
    return this.required(rows[0]);
  }

  private returning(sql: Sql, context: RemovalRow) {
    return sql`
      id, public_id, work_id, revision_id, state, reason, version, created_at,
      attribution_public_id, ${context.attribution_name}::text as attribution_name,
      ${context.person_id}::uuid as person_id, ${context.kind}::text as kind,
      ${context.work_public_id}::uuid as work_public_id,
      ${context.revision_public_id}::uuid as revision_public_id,
      ${context.work_title}::text as work_title,
      ${context.correction_revision_public_id}::uuid as correction_revision_public_id,
      ${context.current_published_revision_public_id}::uuid as current_published_revision_public_id,
      ${context.current_published_revision_version}::bigint as current_published_revision_version
    `;
  }

  private map(row: RemovalRow): AttributionRemovalRequestView {
    return {
      attributionName: row.attribution_name,
      attributionPublicId: row.attribution_public_id,
      correctionRevisionPublicId: row.correction_revision_public_id,
      createdAt: row.created_at.toISOString(),
      currentPublishedRevisionPublicId: row.current_published_revision_public_id,
      currentPublishedRevisionVersion:
        row.current_published_revision_version === null
          ? null
          : Number(row.current_published_revision_version),
      publicId: row.public_id,
      reason: row.reason,
      revisionPublicId: row.revision_public_id,
      state: row.state,
      version: Number(row.version),
      workPublicId: row.work_public_id,
      workTitle: row.work_title,
    };
  }

  private async createReplay(sql: Sql, key: string, payload: postgres.JSONValue) {
    const rows = await sql<Array<{ equivalent: boolean }>>`
      select (actor_account_id is null and operation = 'created'
        and request_payload = ${sql.json(payload)}) as equivalent
      from private.attribution_removal_operations where idempotency_key = ${key}
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : { outcome: row.equivalent ? ('replayed' as const) : ('idempotency_conflict' as const) };
  }

  private async decisionReplay(
    sql: Sql,
    input: { actorAccountId: string; idempotencyKey: string },
    operation: 'accepted' | 'declined',
    payload: postgres.JSONValue,
  ): Promise<AttributionRemovalDecisionResult | null> {
    const operations = await sql<Array<{ equivalent: boolean; request_id: string }>>`
      select request_id, (actor_account_id = ${input.actorAccountId}
        and operation = ${operation} and request_payload = ${sql.json(payload)}) as equivalent
      from private.attribution_removal_operations where idempotency_key = ${input.idempotencyKey}
    `;
    const found = operations[0];
    if (found === undefined) return null;
    if (!found.equivalent) return { outcome: 'idempotency_conflict' };
    const rows = await this.rows(sql, sql`request.id = ${found.request_id}`, 1);
    return rows[0] === undefined
      ? { outcome: 'not_found' }
      : { outcome: 'replayed', request: this.map(rows[0]) };
  }

  private async operation(
    sql: postgres.TransactionSql,
    input: {
      actorAccountId: string | null;
      idempotencyKey: string;
      now: Date;
      operation: 'accepted' | 'created' | 'declined';
      payload: postgres.JSONValue;
      requestId: string;
      resultingState: 'accepted' | 'declined' | 'pending';
      resultingVersion: number;
    },
  ) {
    await sql`insert into private.attribution_removal_operations (
      idempotency_key, request_id, actor_account_id, operation, request_payload,
      resulting_state, resulting_version, occurred_at
    ) values (
      ${input.idempotencyKey}, ${input.requestId}, ${input.actorAccountId}, ${input.operation},
      ${sql.json(input.payload)}, ${input.resultingState}, ${input.resultingVersion}, ${input.now}
    )`;
  }

  private async consumeRateLimit(
    sql: postgres.TransactionSql,
    now: Date,
    dimension: 'source' | 'target',
    key: string,
  ) {
    const start = new Date(now.getTime() - RATE_WINDOW_MILLISECONDS);
    const rows = await sql<Array<{ attempt_count: number }>>`
      insert into private.attribution_removal_rate_limits (
        dimension, key_hash, window_started_at, attempt_count
      ) values (${dimension}, ${key}, ${now}, 1)
      on conflict (dimension, key_hash) do update set
        window_started_at = case when attribution_removal_rate_limits.window_started_at <= ${start}
          then ${now} else attribution_removal_rate_limits.window_started_at end,
        attempt_count = case when attribution_removal_rate_limits.window_started_at <= ${start}
          then 1 else attribution_removal_rate_limits.attempt_count + 1 end
      returning attempt_count
    `;
    return this.required(rows[0]).attempt_count <= RATE_LIMIT;
  }

  private decodeCursor(
    cursor: string | undefined,
  ): { createdAt: Date; id: string } | 'invalid' | null {
    if (cursor === undefined) return null;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        typeof value[0] !== 'string' ||
        typeof value[1] !== 'string' ||
        !/^[0-9a-f-]{36}$/iu.test(value[1])
      )
        return 'invalid';
      const createdAt = new Date(value[0]);
      if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== value[0])
        return 'invalid';
      return { createdAt, id: value[1] };
    } catch {
      return 'invalid';
    }
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('ATTRIBUTION_REMOVAL_PERSISTENCE_INVARIANT');
    return value;
  }
}
