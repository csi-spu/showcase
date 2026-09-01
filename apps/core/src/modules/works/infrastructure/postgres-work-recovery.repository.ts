import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  RemovalRequestResult,
  RemovalRequestView,
  WorkRecoveryRepository,
  WorkRecoveryResult,
  WorkRecoveryView,
} from '../application/work-recovery.ports';
import {
  evaluateWorkRecoveryTransition,
  type WorkRecoveryOperation,
} from '../domain/work-recovery-policy';
import { refreshPublicWorkCatalog } from '../../catalog/infrastructure/postgres-catalog-projection';

type Sql = postgres.Sql;

interface WorkRow {
  activity_state: 'active' | 'archived';
  id: string;
  publication_state: 'never_published' | 'published' | 'unpublished';
  public_id: string;
  published_revision_id: string | null;
  published_revision_public_id: string | null;
  title: string | null;
  version: string;
}

interface RemovalRow {
  created_at: Date;
  decision_reason: string | null;
  id: string;
  public_id: string;
  reason: string;
  revision_public_id: string;
  state: RemovalRequestView['state'];
  title: string;
  version: string;
  work_id: string;
  work_public_id: string;
  work_version: string;
}

@Injectable()
export class PostgresWorkRecoveryRepository implements WorkRecoveryRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findOwnedWorkState(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<WorkRecoveryView | null> {
    const rows = await this.database.sql<WorkRow[]>`
      select work.id, work.public_id, work.activity_state, work.publication_state,
        work.published_revision_id, work.version,
        revision.public_id as published_revision_public_id, revision.title
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      left join private.work_revisions as revision on revision.id = work.published_revision_id
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
      limit 1
    `;
    return this.toWork(rows[0]);
  }

  async findOwnedPendingRemovalRequest(
    actorAccountId: string,
    workPublicId: string,
  ): Promise<RemovalRequestView | null> {
    const rows = await this.database.sql<RemovalRow[]>`
      select request.id, request.public_id, request.work_id, request.state, request.reason,
        request.decision_reason, request.version, request.created_at,
        work.public_id as work_public_id, work.version as work_version,
        revision.public_id as revision_public_id, revision.title
      from private.removal_requests as request
      join public.works as work on work.id = request.work_id
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_revisions as revision on revision.id = request.revision_id
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
        and request.state = 'pending'
      order by request.created_at desc, request.id desc limit 1
    `;
    return rows[0] === undefined ? null : this.toRemoval(rows[0]);
  }

  async findWorkState(workPublicId: string): Promise<WorkRecoveryView | null> {
    const rows = await this.database.sql<WorkRow[]>`
      select work.id, work.public_id, work.activity_state, work.publication_state,
        work.published_revision_id, work.version,
        revision.public_id as published_revision_public_id, revision.title
      from public.works as work
      left join private.work_revisions as revision on revision.id = work.published_revision_id
      where work.public_id = ${workPublicId} limit 1
    `;
    return this.toWork(rows[0]);
  }

  async listPendingRemovalRequests(limit: number): Promise<RemovalRequestView[]> {
    const rows = await this.database.sql<RemovalRow[]>`
      select request.id, request.public_id, request.work_id, request.state, request.reason,
        request.decision_reason, request.version, request.created_at,
        work.public_id as work_public_id, work.version as work_version,
        revision.public_id as revision_public_id, revision.title
      from private.removal_requests as request
      join public.works as work on work.id = request.work_id
      join private.work_revisions as revision on revision.id = request.revision_id
      where request.state = 'pending'
      order by request.created_at, request.id
      limit ${limit}
    `;
    return rows.map((row) => this.toRemoval(row));
  }

  async transition(
    input: Parameters<WorkRecoveryRepository['transition']>[0],
  ): Promise<WorkRecoveryResult> {
    const payload = this.transitionPayload(input);
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.findRecoveryReplay(transaction, input, payload);
        if (replay !== null) return replay;
        const work = await this.lockWork(transaction, input.workPublicId);
        if (work === undefined) return { outcome: 'not_found' };
        if (Number(work.version) !== input.expectedVersion) return { outcome: 'version_conflict' };
        const transition = evaluateWorkRecoveryTransition(
          {
            activityState: work.activity_state,
            publicationState: work.publication_state,
            publishedRevisionId: work.published_revision_id,
            version: Number(work.version),
          },
          input.operation,
        );
        if (!transition.isAllowed) return { outcome: 'state_conflict' };

        const auditRows = await transaction<Array<{ public_id: string }>>`
          insert into private.work_recovery_audits (
            idempotency_key, actor_account_id, work_id, action, reason,
            previous_activity_state, previous_publication_state,
            resulting_activity_state, resulting_publication_state,
            expected_version, resulting_version, request_payload, occurred_at
          ) values (
            ${input.idempotencyKey}, ${input.actorAccountId}, ${work.id}, ${input.operation},
            ${input.reason}, ${work.activity_state}, ${work.publication_state},
            ${transition.state.activityState}, ${transition.state.publicationState},
            ${input.expectedVersion}, ${transition.state.version},
            ${transaction.json(payload)}, ${input.now}
          ) returning public_id
        `;
        await transaction`
          update public.works set activity_state = ${transition.state.activityState},
            publication_state = ${transition.state.publicationState},
            archive_source = case
              when ${input.operation} = 'archive' then 'admin'
              when ${input.operation} = 'restore_active' then null
              else archive_source
            end,
            version = ${transition.state.version}, updated_at = ${input.now}
          where id = ${work.id}
        `;
        if (input.operation === 'archive' || input.operation === 'unpublish') {
          const resolvedRequests = await transaction<RemovalRow[]>`
            update private.removal_requests as request
            set state = 'approved', decided_by_account_id = ${input.actorAccountId},
              resolved_at = ${input.now}, version = version + 1
            where request.work_id = ${work.id} and request.revision_id = ${work.published_revision_id}
              and request.state = 'pending'
            returning request.id, request.public_id, request.work_id, request.state, request.reason,
              request.decision_reason, request.version, request.created_at,
              ${work.public_id}::uuid as work_public_id, ${transition.state.version}::bigint as work_version,
              ${work.published_revision_public_id}::uuid as revision_public_id,
              ${work.title}::text as title
          `;
          const request = resolvedRequests[0];
          if (request !== undefined) {
            await this.recordRemovalOperation(
              transaction,
              request.id,
              input.actorAccountId,
              input.idempotencyKey,
              'approved',
              { source: 'admin_recovery_transition', workPublicId: input.workPublicId },
              'approved',
              Number(request.version),
              input.now,
            );
            await this.recordRemovalDecisionEvent(transaction, request, work, input.now);
          }
        }
        await this.updateTagCounts(transaction, work, input.operation);
        await refreshPublicWorkCatalog(transaction, work.id);
        await this.recordRecoveryEvent(
          transaction,
          work,
          input.operation,
          this.required(auditRows[0]).public_id,
          input.now,
        );
        return {
          outcome: 'transitioned',
          work: this.changedWork(work, transition.state),
        };
      });
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;
      return (
        (await this.findRecoveryReplay(this.database.sql, input, payload)) ?? {
          outcome: 'idempotency_conflict',
        }
      );
    }
  }

  async createRemovalRequest(
    input: Parameters<WorkRecoveryRepository['createRemovalRequest']>[0],
  ): Promise<RemovalRequestResult> {
    const payload: postgres.JSONValue = {
      expectedWorkVersion: input.expectedWorkVersion,
      reason: input.reason,
      workPublicId: input.workPublicId,
    };
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.findRemovalReplay(transaction, input, 'created', payload);
        if (replay !== null) return replay;
        const rows = await transaction<WorkRow[]>`
          select work.id, work.public_id, work.activity_state, work.publication_state,
            work.published_revision_id, work.version,
            revision.public_id as published_revision_public_id, revision.title
          from public.works as work
          join public.accounts as account on account.person_id = work.submitter_person_id
          left join private.work_revisions as revision on revision.id = work.published_revision_id
          where account.id = ${input.actorAccountId} and work.public_id = ${input.workPublicId}
          for update of work
        `;
        const work = rows[0];
        if (work === undefined) return { outcome: 'not_found' };
        if (Number(work.version) !== input.expectedWorkVersion)
          return { outcome: 'version_conflict' };
        if (
          work.activity_state !== 'active' ||
          work.publication_state !== 'published' ||
          work.published_revision_id === null
        ) {
          return { outcome: 'state_conflict' };
        }
        const pending = await transaction<Array<{ exists: boolean }>>`
          select exists(
            select 1 from private.removal_requests
            where revision_id = ${work.published_revision_id} and state = 'pending'
          ) as exists
        `;
        if (this.required(pending[0]).exists) return { outcome: 'state_conflict' };
        const inserted = await transaction<RemovalRow[]>`
          insert into private.removal_requests (
            work_id, revision_id, submitter_account_id, reason, created_at
          ) values (
            ${work.id}, ${work.published_revision_id}, ${input.actorAccountId},
            ${input.reason}, ${input.now}
          ) returning id, public_id, work_id, state, reason, decision_reason, version, created_at,
            ${work.public_id}::uuid as work_public_id, ${work.version}::bigint as work_version,
            ${work.published_revision_public_id}::uuid as revision_public_id,
            ${work.title}::text as title
        `;
        const request = this.required(inserted[0]);
        await this.recordRemovalOperation(
          transaction,
          request.id,
          input.actorAccountId,
          input.idempotencyKey,
          'created',
          payload,
          request.state,
          Number(request.version),
          input.now,
        );
        return { outcome: 'created', request: this.toRemoval(request) };
      });
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;
      return (
        (await this.findRemovalReplay(this.database.sql, input, 'created', payload)) ?? {
          outcome: 'idempotency_conflict',
        }
      );
    }
  }

  async cancelRemovalRequest(
    input: Parameters<WorkRecoveryRepository['cancelRemovalRequest']>[0],
  ): Promise<RemovalRequestResult> {
    const payload: postgres.JSONValue = {
      expectedVersion: input.expectedVersion,
      requestPublicId: input.requestPublicId,
    };
    return this.resolveRemovalMutation(input, 'cancelled', payload, async (transaction) => {
      const request = await this.lockRemovalRequest(
        transaction,
        input.requestPublicId,
        input.actorAccountId,
      );
      if (request === undefined) return { outcome: 'not_found' };
      if (request.state !== 'pending') return { outcome: 'request_state_conflict' };
      if (Number(request.version) !== input.expectedVersion) return { outcome: 'version_conflict' };
      const updated = await this.updateRemovalRequest(
        transaction,
        request,
        'cancelled',
        null,
        null,
        input.now,
      );
      await this.recordRemovalOperation(
        transaction,
        request.id,
        input.actorAccountId,
        input.idempotencyKey,
        'cancelled',
        payload,
        updated.state,
        Number(updated.version),
        input.now,
      );
      return { outcome: 'resolved', request: this.toRemoval(updated) };
    });
  }

  async decideRemovalRequest(
    input: Parameters<WorkRecoveryRepository['decideRemovalRequest']>[0],
  ): Promise<RemovalRequestResult> {
    const operation = input.decision === 'approve' ? 'approved' : 'declined';
    const payload: postgres.JSONValue = {
      decision: input.decision,
      decisionReason: input.decisionReason,
      expectedVersion: input.expectedVersion,
      expectedWorkVersion: input.expectedWorkVersion,
      requestPublicId: input.requestPublicId,
    };
    return this.resolveRemovalMutation(input, operation, payload, async (transaction) => {
      const candidate = await this.findRemovalRequest(transaction, input.requestPublicId);
      if (candidate === undefined) return { outcome: 'not_found' };
      const work = await this.lockWorkById(transaction, candidate.work_id);
      const request = await this.lockRemovalRequest(transaction, input.requestPublicId);
      if (request === undefined) return { outcome: 'not_found' };
      if (request.state !== 'pending') return { outcome: 'request_state_conflict' };
      if (Number(request.version) !== input.expectedVersion) return { outcome: 'version_conflict' };
      if (Number(work.version) !== input.expectedWorkVersion)
        return { outcome: 'version_conflict' };
      if (
        input.decision === 'approve' &&
        (work.activity_state !== 'active' ||
          work.publication_state !== 'published' ||
          work.published_revision_public_id !== request.revision_public_id)
      ) {
        return { outcome: 'state_conflict' };
      }
      const updated = await this.updateRemovalRequest(
        transaction,
        request,
        operation,
        input.decisionReason,
        input.actorAccountId,
        input.now,
      );
      await this.recordRemovalOperation(
        transaction,
        request.id,
        input.actorAccountId,
        input.idempotencyKey,
        operation,
        payload,
        updated.state,
        Number(updated.version),
        input.now,
      );
      if (input.decision === 'approve') {
        const nextVersion = Number(work.version) + 1;
        await transaction`
          update public.works set publication_state = 'unpublished', version = ${nextVersion},
            updated_at = ${input.now} where id = ${work.id}
        `;
        await transaction`
          insert into private.work_recovery_audits (
            idempotency_key, actor_account_id, work_id, action, reason,
            previous_activity_state, previous_publication_state,
            resulting_activity_state, resulting_publication_state,
            expected_version, resulting_version, request_payload, occurred_at
          ) values (
            ${input.idempotencyKey}, ${input.actorAccountId}, ${work.id}, 'unpublish',
            ${request.reason}, ${work.activity_state}, ${work.publication_state},
            'active', 'unpublished', ${input.expectedWorkVersion}, ${nextVersion},
            ${transaction.json(payload)}, ${input.now}
          )
        `;
        await this.updateTagCounts(transaction, work, 'unpublish');
        await refreshPublicWorkCatalog(transaction, work.id);
      }
      await this.recordRemovalDecisionEvent(transaction, updated, work, input.now);
      return { outcome: 'resolved', request: this.toRemoval(updated) };
    });
  }

  private async resolveRemovalMutation(
    input: { actorAccountId: string; idempotencyKey: string; now: Date },
    operation: 'approved' | 'cancelled' | 'declined',
    payload: postgres.JSONValue,
    mutate: (transaction: postgres.TransactionSql) => Promise<RemovalRequestResult>,
  ): Promise<RemovalRequestResult> {
    try {
      return await this.database.sql.begin(async (transaction) => {
        const replay = await this.findRemovalReplay(transaction, input, operation, payload);
        return replay ?? mutate(transaction);
      });
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;
      return (
        (await this.findRemovalReplay(this.database.sql, input, operation, payload)) ?? {
          outcome: 'idempotency_conflict',
        }
      );
    }
  }

  private async lockWork(
    sql: postgres.TransactionSql,
    publicId: string,
  ): Promise<WorkRow | undefined> {
    const rows = await sql<WorkRow[]>`
      select work.id, work.public_id, work.activity_state, work.publication_state,
        work.published_revision_id, work.version,
        revision.public_id as published_revision_public_id, revision.title
      from public.works as work
      left join private.work_revisions as revision on revision.id = work.published_revision_id
      where work.public_id = ${publicId}
      for update of work
    `;
    return rows[0];
  }

  private async lockWorkById(sql: postgres.TransactionSql, id: string): Promise<WorkRow> {
    const rows = await sql<WorkRow[]>`
      select work.id, work.public_id, work.activity_state, work.publication_state,
        work.published_revision_id, work.version,
        revision.public_id as published_revision_public_id, revision.title
      from public.works as work
      left join private.work_revisions as revision on revision.id = work.published_revision_id
      where work.id = ${id}
      for update of work
    `;
    return this.required(rows[0]);
  }

  private async lockRemovalRequest(
    sql: postgres.TransactionSql,
    publicId: string,
    actorAccountId?: string,
  ): Promise<RemovalRow | undefined> {
    const rows = await sql<RemovalRow[]>`
      select request.id, request.public_id, request.work_id, request.state, request.reason,
        request.decision_reason, request.version, request.created_at,
        work.public_id as work_public_id, work.version as work_version,
        revision.public_id as revision_public_id, revision.title
      from private.removal_requests as request
      join public.works as work on work.id = request.work_id
      join private.work_revisions as revision on revision.id = request.revision_id
      where request.public_id = ${publicId}
        and (${actorAccountId ?? null}::uuid is null or request.submitter_account_id = ${actorAccountId ?? null})
      for update of request
    `;
    return rows[0];
  }

  private async findRemovalRequest(sql: Sql, publicId: string): Promise<RemovalRow | undefined> {
    const rows = await sql<RemovalRow[]>`
      select request.id, request.public_id, request.work_id, request.state, request.reason,
        request.decision_reason, request.version, request.created_at,
        work.public_id as work_public_id, work.version as work_version,
        revision.public_id as revision_public_id, revision.title
      from private.removal_requests as request
      join public.works as work on work.id = request.work_id
      join private.work_revisions as revision on revision.id = request.revision_id
      where request.public_id = ${publicId}
    `;
    return rows[0];
  }

  private async updateRemovalRequest(
    sql: postgres.TransactionSql,
    request: RemovalRow,
    state: 'approved' | 'cancelled' | 'declined',
    decisionReason: string | null,
    decidedByAccountId: string | null,
    now: Date,
  ): Promise<RemovalRow> {
    const rows = await sql<RemovalRow[]>`
      update private.removal_requests set state = ${state}, decision_reason = ${decisionReason},
        decided_by_account_id = ${decidedByAccountId}, version = version + 1, resolved_at = ${now}
      where id = ${request.id}
      returning id, public_id, work_id, state, reason, decision_reason, version, created_at,
        ${request.work_public_id}::uuid as work_public_id,
        ${request.work_version}::bigint as work_version,
        ${request.revision_public_id}::uuid as revision_public_id,
        ${request.title}::text as title
    `;
    return this.required(rows[0]);
  }

  private async updateTagCounts(
    sql: postgres.TransactionSql,
    work: WorkRow,
    operation: WorkRecoveryOperation,
  ): Promise<void> {
    if (work.published_revision_id === null) return;
    await sql<Array<{ id: string }>>`
      select tag.id from public.tags as tag
      join private.published_revision_tags as published on published.tag_id = tag.id
      where published.revision_id = ${work.published_revision_id}
      order by tag.id for update of tag
    `;
    if (operation === 'archive' || operation === 'unpublish') {
      if (work.activity_state !== 'active' || work.publication_state !== 'published') return;
      await sql`
        update public.tags as tag set active_work_count = active_work_count - 1
        where exists (
          select 1 from private.published_revision_tags as published
          where published.revision_id = ${work.published_revision_id} and published.tag_id = tag.id
        )
      `;
    }
    if (operation === 'restore_publication') {
      await sql`
        update public.tags as tag set active_work_count = active_work_count + 1
        where exists (
          select 1 from private.published_revision_tags as published
          where published.revision_id = ${work.published_revision_id} and published.tag_id = tag.id
        )
      `;
    }
  }

  private async recordRecoveryEvent(
    sql: postgres.TransactionSql,
    work: WorkRow,
    operation: WorkRecoveryOperation,
    auditPublicId: string,
    now: Date,
  ): Promise<void> {
    const context = await this.effectContext(sql, work);
    await sql`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'work_recovery', ${auditPublicId}, ${`work_${operation}`},
        ${sql.json({
          cacheTargets: context.cacheTargets,
        })}, ${now}
      )
    `;
  }

  private async recordRemovalDecisionEvent(
    sql: postgres.TransactionSql,
    request: RemovalRow,
    work: WorkRow,
    now: Date,
  ): Promise<void> {
    if (request.state !== 'approved') return;
    const context = await this.effectContext(sql, work);
    await sql`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'removal_request', ${request.public_id}, 'removal_request_approved',
        ${sql.json({
          cacheTargets: context.cacheTargets,
        })}, ${now}
      )
    `;
  }

  private async effectContext(sql: postgres.TransactionSql, work: WorkRow) {
    const tags = await sql<Array<{ public_id: string }>>`
      select tag.public_id from private.published_revision_tags as published
      join public.tags as tag on tag.id = published.tag_id
      where published.revision_id = ${work.published_revision_id} order by tag.public_id
    `;
    const media = await sql<Array<{ asset_id: string }>>`
      select asset_id from private.work_revision_media
      where revision_id = ${work.published_revision_id} order by asset_id
    `;
    return {
      cacheTargets: {
        mediaAssetIds: media.map((item) => item.asset_id),
        tagPublicIds: tags.map((item) => item.public_id),
        workPublicId: work.public_id,
      },
    };
  }

  private async recordRemovalOperation(
    sql: postgres.TransactionSql,
    requestId: string,
    actorAccountId: string,
    idempotencyKey: string,
    operation: 'approved' | 'cancelled' | 'created' | 'declined',
    payload: postgres.JSONValue,
    state: RemovalRequestView['state'],
    version: number,
    now: Date,
  ): Promise<void> {
    await sql`
      insert into private.removal_request_operations (
        idempotency_key, request_id, actor_account_id, operation, request_payload,
        resulting_state, resulting_version, occurred_at
      ) values (
        ${idempotencyKey}, ${requestId}, ${actorAccountId}, ${operation}, ${sql.json(payload)},
        ${state}, ${version}, ${now}
      )
    `;
  }

  private async findRecoveryReplay(
    sql: Sql,
    input: Parameters<WorkRecoveryRepository['transition']>[0],
    payload: postgres.JSONValue,
  ): Promise<WorkRecoveryResult | null> {
    const rows = await sql<Array<{ is_equivalent: boolean; work_id: string }>>`
      select work_id, (
        actor_account_id = ${input.actorAccountId} and action = ${input.operation}
        and request_payload = ${sql.json(payload)}
      ) as is_equivalent
      from private.work_recovery_audits where idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return null;
    if (!row.is_equivalent) return { outcome: 'idempotency_conflict' };
    const work = await this.findWorkById(sql, row.work_id);
    return work === null ? { outcome: 'not_found' } : { outcome: 'replayed', work };
  }

  private async findRemovalReplay(
    sql: Sql,
    input: { actorAccountId: string; idempotencyKey: string },
    operation: 'approved' | 'cancelled' | 'created' | 'declined',
    payload: postgres.JSONValue,
  ): Promise<RemovalRequestResult | null> {
    const rows = await sql<Array<{ is_equivalent: boolean; request_id: string }>>`
      select request_id, (
        actor_account_id = ${input.actorAccountId} and operation = ${operation}
        and request_payload = ${sql.json(payload)}
      ) as is_equivalent
      from private.removal_request_operations where idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return null;
    if (!row.is_equivalent) return { outcome: 'idempotency_conflict' };
    const request = await this.findRemovalById(sql, row.request_id);
    return request === null ? { outcome: 'not_found' } : { outcome: 'replayed', request };
  }

  private async findWorkById(sql: Sql, id: string): Promise<WorkRecoveryView | null> {
    const rows = await sql<WorkRow[]>`
      select work.id, work.public_id, work.activity_state, work.publication_state,
        work.published_revision_id, work.version,
        revision.public_id as published_revision_public_id, revision.title
      from public.works as work
      left join private.work_revisions as revision on revision.id = work.published_revision_id
      where work.id = ${id} limit 1
    `;
    return this.toWork(rows[0]);
  }

  private async findRemovalById(sql: Sql, id: string): Promise<RemovalRequestView | null> {
    const rows = await sql<RemovalRow[]>`
      select request.id, request.public_id, request.work_id, request.state, request.reason,
        request.decision_reason, request.version, request.created_at,
        work.public_id as work_public_id, work.version as work_version,
        revision.public_id as revision_public_id, revision.title
      from private.removal_requests as request
      join public.works as work on work.id = request.work_id
      join private.work_revisions as revision on revision.id = request.revision_id
      where request.id = ${id} limit 1
    `;
    return rows[0] === undefined ? null : this.toRemoval(rows[0]);
  }

  private transitionPayload(
    input: Parameters<WorkRecoveryRepository['transition']>[0],
  ): postgres.JSONValue {
    return {
      expectedVersion: input.expectedVersion,
      operation: input.operation,
      reason: input.reason,
      workPublicId: input.workPublicId,
    };
  }

  private changedWork(
    work: WorkRow,
    state: {
      activityState: WorkRecoveryView['activityState'];
      publicationState: WorkRecoveryView['publicationState'];
      version: number;
    },
  ): WorkRecoveryView {
    return {
      ...state,
      publicId: work.public_id,
      publishedRevisionId: work.published_revision_id,
      publishedRevisionPublicId: work.published_revision_public_id,
    };
  }

  private toWork(row: WorkRow | undefined): WorkRecoveryView | null {
    return row === undefined
      ? null
      : {
          activityState: row.activity_state,
          publicationState: row.publication_state,
          publicId: row.public_id,
          publishedRevisionId: row.published_revision_id,
          publishedRevisionPublicId: row.published_revision_public_id,
          version: Number(row.version),
        };
  }

  private toRemoval(row: RemovalRow): RemovalRequestView {
    return {
      createdAt: row.created_at.toISOString(),
      decisionReason: row.decision_reason,
      publicId: row.public_id,
      reason: row.reason,
      revisionPublicId: row.revision_public_id,
      state: row.state,
      title: row.title,
      version: Number(row.version),
      workVersion: Number(row.work_version),
      workPublicId: row.work_public_id,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('WORK_RECOVERY_PERSISTENCE_INVARIANT');
    return value;
  }
}
