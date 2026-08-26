import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresNotificationsRepository } from '../src/modules/notifications/infrastructure/postgres-notifications.repository';
import { projectNotificationEvent } from '../src/modules/notifications/domain/notification-event';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PERSON_ID = '81000000-0000-4000-8000-000000000001';
const OTHER_PERSON_ID = '81000000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '82000000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT_ID = '82000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-08-26T05:00:00.000Z');

describe('PostgresNotificationsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresNotificationsRepository(database);

  beforeEach(async () => {
    await cleanup();
    await seedAccounts();
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('projects an outbox event at most once under retries and isolates recipient and audience', async () => {
    const eventId = await insertAccessEvent(NOW);
    const delivery = await repository.claimDelivery(NOW);
    expect(delivery).toMatchObject({ attemptCount: 1, eventId });
    if (delivery === null) throw new Error('EXPECTED_NOTIFICATION_DELIVERY');
    const projections = projectNotificationEvent(delivery);

    await Promise.all([
      repository.insertProjections(projections),
      repository.insertProjections(projections),
    ]);
    await repository.completeDelivery(eventId, projections.length, NOW);

    await expect(list(ACCOUNT_ID, 'student', 20)).resolves.toMatchObject({
      items: [
        {
          targetAvailable: true,
          targetDestination: 'student_home',
          type: 'student_access_extended',
        },
      ],
      nextCursor: null,
    });
    await expect(list(OTHER_ACCOUNT_ID, 'student', 20)).resolves.toMatchObject({ items: [] });
    await expect(list(ACCOUNT_ID, 'admin', 20)).resolves.toMatchObject({ items: [] });
    await expect(notificationCount()).resolves.toBe(1);
  });

  it('paginates newest first and authorizes idempotent mark-one', async () => {
    await projectAccessEvent(new Date('2026-08-26T04:00:00.000Z'));
    await projectAccessEvent(new Date('2026-08-26T04:01:00.000Z'));

    const first = await list(ACCOUNT_ID, 'student', 1);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await repository.list({
      accountId: ACCOUNT_ID,
      audience: 'student',
      cursor: first.nextCursor,
      limit: 1,
      retainedAfter: new Date('2026-01-01T00:00:00.000Z'),
      view: 'all',
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.createdAt.getTime()).toBeLessThan(
      first.items[0]?.createdAt.getTime() ?? 0,
    );

    const publicId = first.items[0]?.publicId;
    if (publicId === undefined) throw new Error('EXPECTED_NOTIFICATION');
    await expect(
      repository.markRead({
        accountId: OTHER_ACCOUNT_ID,
        audience: 'student',
        notificationPublicId: publicId,
        now: NOW,
      }),
    ).resolves.toBeNull();
    const firstRead = await repository.markRead({
      accountId: ACCOUNT_ID,
      audience: 'student',
      notificationPublicId: publicId,
      now: NOW,
    });
    const replay = await repository.markRead({
      accountId: ACCOUNT_ID,
      audience: 'student',
      notificationPublicId: publicId,
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(replay?.readAt).toEqual(firstRead?.readAt);
  });

  it('marks only Notifications existing at the server cutoff and counts retained unread exactly', async () => {
    await projectAccessEvent(new Date(NOW.getTime() - 1_000));
    await expect(
      repository.markAllRead({ accountId: ACCOUNT_ID, audience: 'student', cutoff: NOW }),
    ).resolves.toBe(1);
    await projectAccessEvent(new Date(NOW.getTime() + 1_000));

    await expect(
      repository.countUnread({
        accountId: ACCOUNT_ID,
        audience: 'student',
        retainedAfter: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).resolves.toBe(1);
  });

  it('reconciles missing delivery intent and expires only the Notification projection', async () => {
    const occurredAt = new Date('2026-01-01T00:00:00.000Z');
    const eventId = await insertAccessEvent(occurredAt);
    await database.sql`delete from private.notification_deliveries where event_id = ${eventId}`;

    await expect(repository.reconcile(new Date('2026-01-02T00:00:00.000Z'))).resolves.toBe(1);
    await expect(repository.reconcile(new Date('2026-01-02T00:00:00.000Z'))).resolves.toBe(0);
    const delivery = await repository.claimDelivery(new Date('2026-01-02T00:00:00.000Z'));
    if (delivery === null) throw new Error('EXPECTED_RECONCILED_DELIVERY');
    await repository.insertProjections(projectNotificationEvent(delivery));
    await repository.completeDelivery(eventId, 1, new Date('2026-01-02T00:00:01.000Z'));

    await database.sql`delete from private.notifications where event_id = ${eventId}`;
    await expect(repository.reconcile(new Date('2026-01-03T00:00:00.000Z'))).resolves.toBe(1);
    const drifted = await repository.claimDelivery(new Date('2026-01-03T00:00:00.000Z'));
    if (drifted === null) throw new Error('EXPECTED_DRIFTED_DELIVERY');
    await repository.insertProjections(projectNotificationEvent(drifted));
    await repository.completeDelivery(eventId, 1, new Date('2026-01-03T00:00:01.000Z'));

    await expect(repository.deleteExpired(new Date('2026-07-01T00:00:00.000Z'))).resolves.toBe(1);
    await expect(notificationCount()).resolves.toBe(0);
    const events = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.outbox_events where id = ${eventId}
    `;
    expect(events).toEqual([{ count: 1 }]);
  });

  async function projectAccessEvent(occurredAt: Date): Promise<void> {
    const eventId = await insertAccessEvent(occurredAt);
    const delivery = await repository.claimDelivery(new Date(occurredAt.getTime() + 1));
    if (delivery === null || delivery.eventId !== eventId) throw new Error('EXPECTED_DELIVERY');
    await repository.insertProjections(projectNotificationEvent(delivery));
    await repository.completeDelivery(eventId, 1, occurredAt);
  }

  async function insertAccessEvent(occurredAt: Date): Promise<number> {
    const aggregateId = crypto.randomUUID();
    const rows = await database.sql<Array<{ id: string }>>`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'student_access_extension', ${aggregateId}, 'student_access_extended',
        ${database.sql.json({ accessEndsAcademicYear: 2577, studentAccountId: ACCOUNT_ID })},
        ${occurredAt}
      ) returning id
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('EXPECTED_EVENT');
    await database.sql`
      update private.notification_deliveries
      set next_attempt_at = '1900-01-01T00:00:00.000Z'
      where event_id = ${row.id}
    `;
    return Number(row.id);
  }

  function list(accountId: string, audience: 'admin' | 'student', limit: number) {
    return repository.list({
      accountId,
      audience,
      cursor: null,
      limit,
      retainedAfter: new Date('2026-01-01T00:00:00.000Z'),
      view: 'all',
    });
  }

  async function notificationCount(): Promise<number> {
    const rows = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.notifications
      where recipient_person_id = ${PERSON_ID}
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('EXPECTED_COUNT');
    return row.count;
  }

  async function seedAccounts(): Promise<void> {
    await database.sql`
      insert into public.people (id) values (${PERSON_ID}), (${OTHER_PERSON_ID})
      on conflict (id) do nothing
    `;
    await database.sql`
      insert into public.accounts (id, person_id, provider_user_id, credential_state)
      values
        (${ACCOUNT_ID}, ${PERSON_ID}, '83000000-0000-4000-8000-000000000001', 'set'),
        (${OTHER_ACCOUNT_ID}, ${OTHER_PERSON_ID}, '83000000-0000-4000-8000-000000000002', 'set')
      on conflict (id) do nothing
    `;
  }

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (sql) => {
      await sql`delete from private.notifications where recipient_person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
      await sql`
        delete from private.notification_deliveries where event_id in (
          select id from private.outbox_events where aggregate_type = 'student_access_extension'
            and payload ->> 'studentAccountId' in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
        )
      `;
      await sql`
        delete from private.outbox_events where aggregate_type = 'student_access_extension'
          and payload ->> 'studentAccountId' in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await sql`delete from public.accounts where id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})`;
      await sql`delete from public.people where id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
    });
  }
});
