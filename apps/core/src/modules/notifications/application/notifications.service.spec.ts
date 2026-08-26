import { NotificationsService } from './notifications.service';
import type { NotificationRepository } from './notifications.ports';

const NOW = new Date('2026-08-26T05:00:00.000Z');
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('NotificationsService', () => {
  it('returns a bounded newest-first page and opaque next cursor', async () => {
    const repository = createRepository();
    repository.list.mockResolvedValue({
      items: [notification(3)],
      nextCursor: { createdAt: new Date('2026-08-26T04:58:00.000Z'), id: '2' },
    });
    const service = new NotificationsService(repository);

    const page = await service.list({
      accountId: ACCOUNT_ID,
      audience: 'student',
      limit: 1,
      now: NOW,
      view: 'unread',
    });

    expect(repository.list.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ accountId: ACCOUNT_ID, audience: 'student', limit: 1 }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('marks only an existing Notification owned by the current audience', async () => {
    const repository = createRepository();
    repository.markRead.mockResolvedValue(null);
    const service = new NotificationsService(repository);

    await expect(
      service.markRead({
        accountId: ACCOUNT_ID,
        audience: 'student',
        notificationPublicId: '22222222-2222-4222-8222-222222222222',
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_NOT_FOUND', status: 404 });
  });

  it('uses one server cutoff when marking all existing Notifications read', async () => {
    const repository = createRepository();
    repository.markAllRead.mockResolvedValue(4);
    const service = new NotificationsService(repository);

    await expect(
      service.markAllRead({ accountId: ACCOUNT_ID, audience: 'student', now: NOW }),
    ).resolves.toEqual({ cutoff: NOW.toISOString(), updatedCount: 4 });
    expect(repository.markAllRead.mock.calls[0]?.[0]).toEqual({
      accountId: ACCOUNT_ID,
      audience: 'student',
      cutoff: NOW,
    });
  });

  it('completes a retry-safe projected delivery and runs bounded maintenance', async () => {
    const repository = createRepository();
    repository.claimDelivery.mockResolvedValue({
      attemptCount: 1,
      eventId: 41,
      eventType: 'student_access_extended',
      occurredAt: NOW,
      payload: {
        accessEndsAcademicYear: 2577,
        studentAccountId: ACCOUNT_ID,
      },
    });
    repository.deleteExpired.mockResolvedValue(3);
    repository.reconcile.mockResolvedValue(1);
    const service = new NotificationsService(repository);

    await expect(service.processNext(NOW)).resolves.toBe(true);
    expect(repository.insertProjections.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ eventId: 41, recipientAccountId: ACCOUNT_ID }),
    ]);
    expect(repository.completeDelivery.mock.calls[0]).toEqual([41, 1, expect.any(Date)]);
    await expect(service.maintain(NOW)).resolves.toEqual({ deletedCount: 3, reconciledCount: 1 });
  });
});

function notification(id: number) {
  return {
    createdAt: new Date(`2026-08-26T04:${String(60 - id).padStart(2, '0')}:00.000Z`),
    id: String(id),
    parameters: {},
    publicId: `${id}1111111-1111-4111-8111-111111111111`,
    readAt: null,
    target: { kind: 'student_access' as const },
    targetDestination: 'student_home' as const,
    targetAvailable: true,
    type: 'student_access_extended' as const,
  };
}

function createRepository(): jest.Mocked<NotificationRepository> {
  return {
    claimDelivery: jest.fn(),
    completeDelivery: jest.fn(),
    countUnread: jest.fn(),
    deleteExpired: jest.fn(),
    failDelivery: jest.fn(),
    insertProjections: jest.fn(),
    list: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
    reconcile: jest.fn(),
  };
}
