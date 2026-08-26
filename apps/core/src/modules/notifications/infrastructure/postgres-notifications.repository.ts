import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type { NotificationProjection } from '../domain/notification-event';
import {
  notificationParametersSchema,
  notificationTargetSchema,
  notificationTypeSchema,
} from '../domain/notification-event';
import type {
  NotificationDelivery,
  NotificationRecord,
  NotificationRepository,
} from '../application/notifications.ports';

interface DeliveryRow {
  attempt_count: number;
  event_id: string;
  event_type: string;
  occurred_at: Date;
  payload: unknown;
}

interface NotificationRow {
  created_at: Date;
  id: string;
  parameters: unknown;
  public_id: string;
  read_at: Date | null;
  target: unknown;
  target_destination: string | null;
  type: string;
}

const NOTIFICATION_EVENT_TYPES = [
  'admin_correction_created',
  'attribution_invitation_accepted',
  'attribution_invitation_created',
  'attribution_invitation_expired',
  'attribution_invitation_rejected',
  'attribution_invitation_revoked',
  'attribution_withdrawn',
  'removal_request_approved',
  'removal_request_declined',
  'roster_batch_completed',
  'student_access_extended',
  'work_archive',
  'work_restore_active',
  'work_restore_publication',
  'work_revision_changes_requested',
  'work_revision_published',
  'work_unpublish',
] as const;

@Injectable()
export class PostgresNotificationsRepository implements NotificationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async claimDelivery(now: Date): Promise<NotificationDelivery | null> {
    const rows = await this.database.sql.begin(async (sql) => {
      await sql`
        update private.notification_deliveries
        set status = 'failed', lease_expires_at = null,
          last_error_code = 'NOTIFICATION_LEASE_EXHAUSTED', updated_at = ${now}
        where status = 'processing' and attempt_count >= 8 and lease_expires_at <= ${now}
      `;
      return sql<DeliveryRow[]>`
        with candidate as (
          select delivery.event_id, event.event_type, event.payload, event.occurred_at
          from private.notification_deliveries as delivery
          join private.outbox_events as event on event.id = delivery.event_id
          where delivery.attempt_count < 8 and (
            (delivery.status = 'pending' and delivery.next_attempt_at <= ${now})
            or (delivery.status = 'processing' and delivery.lease_expires_at <= ${now})
          )
          order by delivery.next_attempt_at, delivery.event_id
          for update of delivery skip locked
          limit 1
        ), claimed as (
          update private.notification_deliveries as delivery
          set status = 'processing', attempt_count = attempt_count + 1,
            lease_expires_at = ${now} + interval '30 seconds', updated_at = ${now}
          from candidate
          where delivery.event_id = candidate.event_id
          returning delivery.event_id, delivery.attempt_count
        )
        select claimed.event_id, claimed.attempt_count, candidate.event_type,
          candidate.payload, candidate.occurred_at
        from claimed join candidate on candidate.event_id = claimed.event_id
      `;
    });
    const row = rows[0];
    return row === undefined
      ? null
      : {
          attemptCount: row.attempt_count,
          eventId: Number(row.event_id),
          eventType: row.event_type,
          occurredAt: row.occurred_at,
          payload: row.payload,
        };
  }

  async insertProjections(projections: readonly NotificationProjection[]): Promise<void> {
    await this.database.sql.begin(async (sql) => {
      for (const projection of projections) {
        await this.insertProjection(sql, projection);
      }
    });
  }

  async completeDelivery(eventId: number, projectedCount: number, now: Date): Promise<void> {
    await this.database.sql`
      update private.notification_deliveries
      set status = 'completed', lease_expires_at = null, completed_at = ${now},
        projected_count = ${projectedCount}, last_error_code = null, updated_at = ${now}
      where event_id = ${eventId} and status = 'processing'
    `;
  }

  async failDelivery(input: {
    errorCode: string;
    eventId: number;
    nextAttemptAt: Date | null;
    now: Date;
  }): Promise<void> {
    await this.database.sql`
      update private.notification_deliveries
      set status = ${input.nextAttemptAt === null ? 'failed' : 'pending'},
        next_attempt_at = ${input.nextAttemptAt ?? input.now}, lease_expires_at = null,
        last_error_code = ${input.errorCode.slice(0, 100)}, updated_at = ${input.now}
      where event_id = ${input.eventId} and status = 'processing'
    `;
  }

  async list(input: Parameters<NotificationRepository['list']>[0]) {
    const cursor = input.cursor;
    const rows = await this.database.sql<NotificationRow[]>`
      select notification.id, notification.public_id, notification.type,
        notification.parameters, notification.target, notification.created_at,
        notification.read_at,
        ${this.targetDestination(this.database.sql, input.accountId)} as target_destination
      from private.notifications as notification
      join public.accounts as actor_account
        on actor_account.id = ${input.accountId}
        and actor_account.person_id = notification.recipient_person_id
      where notification.audience = ${input.audience}
        and notification.created_at > ${input.retainedAfter}
        and (${input.view} = 'all' or notification.read_at is null)
        and (
          ${cursor?.createdAt ?? null}::timestamptz is null
          or (notification.created_at, notification.id) < (
            ${cursor?.createdAt ?? null}::timestamptz,
            ${cursor?.id ?? null}::bigint
          )
        )
      order by notification.created_at desc, notification.id desc
      limit ${input.limit + 1}
    `;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => this.map(row)),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? { createdAt: last.created_at, id: last.id }
          : null,
    };
  }

  async countUnread(input: Parameters<NotificationRepository['countUnread']>[0]): Promise<number> {
    const rows = await this.database.sql<Array<{ count: number }>>`
      select count(*)::integer as count
      from private.notifications as notification
      join public.accounts as actor_account
        on actor_account.id = ${input.accountId}
        and actor_account.person_id = notification.recipient_person_id
      where notification.audience = ${input.audience}
        and notification.read_at is null
        and notification.created_at > ${input.retainedAfter}
    `;
    return this.required(rows[0]).count;
  }

  async markRead(input: Parameters<NotificationRepository['markRead']>[0]) {
    return this.database.sql.begin(async (sql) => {
      const updated = await sql<Array<{ id: string }>>`
        update private.notifications as notification
        set read_at = coalesce(notification.read_at, ${input.now})
        from public.accounts as actor_account
        where actor_account.id = ${input.accountId}
          and actor_account.person_id = notification.recipient_person_id
          and notification.audience = ${input.audience}
          and notification.public_id = ${input.notificationPublicId}
        returning notification.id
      `;
      const row = updated[0];
      if (row === undefined) return null;
      const notifications = await sql<NotificationRow[]>`
        select notification.id, notification.public_id, notification.type,
          notification.parameters, notification.target, notification.created_at,
          notification.read_at,
          ${this.targetDestination(sql, input.accountId)} as target_destination
        from private.notifications as notification where notification.id = ${row.id}
      `;
      return this.map(this.required(notifications[0]));
    });
  }

  async markAllRead(input: Parameters<NotificationRepository['markAllRead']>[0]): Promise<number> {
    const rows = await this.database.sql<Array<{ id: string }>>`
      update private.notifications as notification
      set read_at = ${input.cutoff}
      from public.accounts as actor_account
      where actor_account.id = ${input.accountId}
        and actor_account.person_id = notification.recipient_person_id
        and notification.audience = ${input.audience}
        and notification.read_at is null
        and notification.created_at <= ${input.cutoff}
      returning notification.id
    `;
    return rows.length;
  }

  async deleteExpired(retainedAfter: Date): Promise<number> {
    const rows = await this.database.sql<Array<{ id: string }>>`
      delete from private.notifications
      where id in (
        select id from private.notifications
        where created_at <= ${retainedAfter}
        order by created_at, id
        limit 1000
      )
      returning id
    `;
    return rows.length;
  }

  async reconcile(now: Date): Promise<number> {
    return this.database.sql.begin(async (sql) => {
      const drifted = await sql<Array<{ event_id: string }>>`
        with candidate as (
          select delivery.event_id
          from private.notification_deliveries as delivery
          join private.outbox_events as event on event.id = delivery.event_id
          where delivery.status = 'completed'
            and event.occurred_at > ${new Date(now.getTime() - 180 * 24 * 60 * 60 * 1_000)}
            and delivery.projected_count <> (
              select count(*)::smallint from private.notifications as notification
              where notification.event_id = delivery.event_id
            )
          order by delivery.event_id
          for update of delivery skip locked
          limit 1000
        )
        update private.notification_deliveries as delivery
        set status = 'pending', attempt_count = 0, next_attempt_at = ${now},
          lease_expires_at = null, completed_at = null, projected_count = null,
          last_error_code = 'NOTIFICATION_PROJECTION_DRIFT', updated_at = ${now}
        from candidate where delivery.event_id = candidate.event_id
        returning delivery.event_id
      `;
      const missing = await sql<Array<{ event_id: string }>>`
        insert into private.notification_deliveries (
          event_id, next_attempt_at, created_at, updated_at
        )
        select event.id, ${now}, ${now}, ${now}
        from private.outbox_events as event
        where event.event_type in ${sql(NOTIFICATION_EVENT_TYPES)}
          and not exists (
            select 1 from private.notification_deliveries as delivery
            where delivery.event_id = event.id
          )
        order by event.id
        limit 1000
        on conflict (event_id) do nothing
        returning event_id
      `;
      return drifted.length + missing.length;
    });
  }

  private async insertProjection(
    sql: postgres.TransactionSql,
    projection: NotificationProjection,
  ): Promise<void> {
    await sql`
      insert into private.notifications (
        event_id, recipient_person_id, audience, type, parameters, target, created_at
      )
      select ${projection.eventId}, account.person_id, ${projection.audience},
        ${projection.type}, ${sql.json(projection.parameters)}, ${sql.json(projection.target)},
        ${projection.createdAt}
      from public.accounts as account
      where account.id = ${projection.recipientAccountId}
      on conflict (event_id, recipient_person_id, audience, type) do nothing
    `;
  }

  private targetDestination(sql: postgres.Sql | postgres.TransactionSql, accountId: string) {
    return sql`
      case notification.target ->> 'kind'
        when 'student_access' then 'student_home'
        when 'roster_batch' then case when exists (
          select 1 from private.roster_batches as batch
          where batch.id = (notification.target ->> 'batchId')::uuid
            and batch.uploader_account_id = ${accountId}
        ) then 'admin_roster' end
        when 'attribution_invitation' then case when exists (
          select 1
          from private.attribution_invitations as invitation
          join public.works as work on work.id = invitation.work_id
          join public.accounts as actor_account on actor_account.id = ${accountId}
          where invitation.public_id = (notification.target ->> 'invitationPublicId')::uuid
            and (
              invitation.invitee_person_id = actor_account.person_id
              or work.submitter_person_id = actor_account.person_id
            )
        ) then 'student_invitations' end
        when 'work' then (
          select case
            when work.submitter_person_id = actor_account.person_id then 'student_work'
            when work.activity_state = 'active' and work.publication_state = 'published'
              and exists (
                select 1 from private.work_revision_attributions as attribution
                where attribution.revision_id = work.published_revision_id
                  and attribution.person_id = actor_account.person_id
                  and attribution.kind = 'account'
              )
            then 'public_work'
            else null
          end
          from public.works as work
          join public.accounts as actor_account on actor_account.id = ${accountId}
          where work.public_id = (notification.target ->> 'workPublicId')::uuid
          limit 1
        )
        else null
      end
    `;
  }

  private map(row: NotificationRow): NotificationRecord {
    return {
      createdAt: row.created_at,
      id: row.id,
      parameters: notificationParametersSchema.parse(row.parameters),
      publicId: row.public_id,
      readAt: row.read_at,
      target: notificationTargetSchema.parse(row.target),
      targetAvailable: row.target_destination !== null,
      targetDestination: this.mapTargetDestination(row.target_destination),
      type: notificationTypeSchema.parse(row.type),
    };
  }

  private mapTargetDestination(value: string | null): NotificationRecord['targetDestination'] {
    if (
      value === null ||
      [
        'admin_roster',
        'public_work',
        'student_home',
        'student_invitations',
        'student_work',
      ].includes(value)
    ) {
      return value as NotificationRecord['targetDestination'];
    }
    throw new Error('NOTIFICATION_TARGET_DESTINATION_INVALID');
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('NOTIFICATION_DATABASE_RESULT_MISSING');
    return value;
  }
}
