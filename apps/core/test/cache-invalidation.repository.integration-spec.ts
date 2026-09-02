import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresCacheInvalidationRepository } from '../src/modules/catalog/infrastructure/postgres-cache-invalidation.repository';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const NOW = new Date('2026-08-26T08:00:00.000Z');
const EVENT_OCCURRED_AT = new Date('2026-08-24T08:00:00.000Z');
const AGGREGATE_ID = '91000000-0000-4000-8000-000000000023';

describe('PostgresCacheInvalidationRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresCacheInvalidationRepository(database);

  beforeEach(async () => cleanup());

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('atomically queues, claims, and completes durable cache intent', async () => {
    const eventId = await insertEvent();
    await expect(cacheVersion()).resolves.toBe(String(eventId));

    const claimed = await repository.claim(NOW);
    expect(claimed).toMatchObject({ attemptCount: 1, payload: { publicId: AGGREGATE_ID } });
    if (claimed === null) throw new Error('EXPECTED_CACHE_INVALIDATION_JOB');

    await repository.complete(claimed.eventId, new Date(NOW.getTime() + 1_000));
    await expect(deliveryState()).resolves.toMatchObject({
      attempt_count: 1,
      status: 'completed',
    });
  });

  it('reconciles a missing delivery idempotently', async () => {
    const eventId = await insertEvent();
    await database.sql`delete from private.cache_invalidation_deliveries where event_id = ${eventId}`;
    await expect(reconcile()).resolves.toBe(1);
    await expect(reconcile()).resolves.toBe(0);
    await expect(deliveryState()).resolves.toMatchObject({ status: 'pending' });
  });

  async function insertEvent(): Promise<number> {
    const rows = await database.sql<Array<{ id: string }>>`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'public_profile', ${AGGREGATE_ID}, 'public_profile_cache_invalidated',
        ${database.sql.json({ publicId: AGGREGATE_ID })}, ${EVENT_OCCURRED_AT}
      ) returning id
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('EXPECTED_OUTBOX_EVENT');
    return Number(row.id);
  }

  async function reconcile(): Promise<number> {
    const rows = await database.sql<Array<{ count: number }>>`
      select private.reconcile_public_cache_invalidations() as count
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('EXPECTED_RECONCILIATION_RESULT');
    return row.count;
  }

  async function deliveryState() {
    const rows = await database.sql<Array<{ attempt_count: number; status: string }>>`
      select attempt_count, status from private.cache_invalidation_deliveries
      where event_id = (
        select id from private.outbox_events
        where aggregate_type = 'public_profile' and aggregate_id = ${AGGREGATE_ID}
      )
    `;
    return rows[0];
  }

  async function cacheVersion(): Promise<string> {
    const rows = await database.sql<Array<{ version: bigint }>>`
      select version from private.public_cache_version where singleton
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('EXPECTED_PUBLIC_CACHE_VERSION');
    return row.version.toString();
  }

  async function cleanup(): Promise<void> {
    await database.sql`
      delete from private.outbox_events
      where aggregate_type = 'public_profile' and aggregate_id = ${AGGREGATE_ID}
    `;
  }
});
