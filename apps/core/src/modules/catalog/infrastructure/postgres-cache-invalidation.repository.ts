import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  CacheInvalidationJob,
  CacheInvalidationRepository,
} from '../application/cache-invalidation.ports';

interface ClaimedRow {
  attempt_count: number;
  event_id: string;
  occurred_at: Date;
  payload: unknown;
}

@Injectable()
export class PostgresCacheInvalidationRepository implements CacheInvalidationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async claim(now: Date): Promise<CacheInvalidationJob | null> {
    const rows = await this.database.sql.begin(async (sql) => {
      await sql`
        update private.cache_invalidation_deliveries
        set status = 'failed', lease_expires_at = null,
          last_error_code = 'CACHE_INVALIDATION_LEASE_EXHAUSTED', updated_at = ${now}
        where status = 'processing' and attempt_count >= 8 and lease_expires_at <= ${now}
      `;
      return sql<ClaimedRow[]>`
        with candidate as (
          select delivery.event_id, event.payload, event.occurred_at
          from private.cache_invalidation_deliveries as delivery
          join private.outbox_events as event on event.id = delivery.event_id
          where delivery.attempt_count < 8 and (
            (delivery.status = 'pending' and delivery.next_attempt_at <= ${now})
            or (delivery.status = 'processing' and delivery.lease_expires_at <= ${now})
          )
          order by delivery.next_attempt_at, delivery.event_id
          for update of delivery skip locked
          limit 1
        ), claimed as (
          update private.cache_invalidation_deliveries as delivery
          set status = 'processing', attempt_count = attempt_count + 1,
            lease_expires_at = ${now} + interval '30 seconds', updated_at = ${now}
          from candidate
          where delivery.event_id = candidate.event_id
          returning delivery.event_id, delivery.attempt_count
        )
        select claimed.event_id, claimed.attempt_count, candidate.payload, candidate.occurred_at
        from claimed
        join candidate on candidate.event_id = claimed.event_id
      `;
    });
    const row = rows[0];
    return row === undefined
      ? null
      : {
          attemptCount: row.attempt_count,
          eventId: Number(row.event_id),
          occurredAt: row.occurred_at,
          payload: row.payload,
        };
  }

  async complete(eventId: number, now: Date): Promise<void> {
    await this.database.sql`
      update private.cache_invalidation_deliveries
      set status = 'completed', lease_expires_at = null, completed_at = ${now},
        last_error_code = null, updated_at = ${now}
      where event_id = ${eventId} and status = 'processing'
    `;
  }

  async fail(
    eventId: number,
    nextAttemptAt: Date | null,
    errorCode: string,
    now: Date,
  ): Promise<void> {
    await this.database.sql`
      update private.cache_invalidation_deliveries
      set status = ${nextAttemptAt === null ? 'failed' : 'pending'},
        next_attempt_at = ${nextAttemptAt ?? now}, lease_expires_at = null,
        last_error_code = ${errorCode}, updated_at = ${now}
      where event_id = ${eventId} and status = 'processing'
    `;
  }
}
