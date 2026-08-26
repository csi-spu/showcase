import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { projectNotificationEvent } from '../domain/notification-event';
import type { NotificationAudience } from '../domain/notification-event';
import { NotificationsError } from './notifications.error';
import { NOTIFICATION_REPOSITORY } from './notifications.ports';
import type {
  NotificationCursor,
  NotificationRecord,
  NotificationRepository,
} from './notifications.ports';

const RETENTION_MILLISECONDS = 180 * 24 * 60 * 60 * 1_000;
const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_SECONDS = [5, 15, 30, 60, 120, 300, 300] as const;
const cursorSchema = z.tuple([z.iso.datetime(), z.string().regex(/^\d+$/u)]);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
  ) {}

  async list(input: {
    accountId: string;
    audience: NotificationAudience;
    cursor?: string;
    limit: number;
    now: Date;
    view: 'all' | 'unread';
  }) {
    const page = await this.repository.list({
      accountId: input.accountId,
      audience: input.audience,
      cursor: this.decodeCursor(input.cursor),
      limit: input.limit,
      retainedAfter: retainedAfter(input.now),
      view: input.view,
    });
    return {
      items: page.items.map(toResponse),
      nextCursor: page.nextCursor === null ? null : this.encodeCursor(page.nextCursor),
    };
  }

  async countUnread(input: {
    accountId: string;
    audience: NotificationAudience;
    now: Date;
  }): Promise<{ count: number }> {
    return {
      count: await this.repository.countUnread({
        accountId: input.accountId,
        audience: input.audience,
        retainedAfter: retainedAfter(input.now),
      }),
    };
  }

  async markRead(input: {
    accountId: string;
    audience: NotificationAudience;
    notificationPublicId: string;
    now: Date;
  }) {
    const notification = await this.repository.markRead(input);
    if (notification === null) throw new NotificationsError('NOTIFICATION_NOT_FOUND', 404);
    return toResponse(notification);
  }

  async markAllRead(input: {
    accountId: string;
    audience: NotificationAudience;
    now: Date;
  }): Promise<{ cutoff: string; updatedCount: number }> {
    return {
      cutoff: input.now.toISOString(),
      updatedCount: await this.repository.markAllRead({
        accountId: input.accountId,
        audience: input.audience,
        cutoff: input.now,
      }),
    };
  }

  async processNext(now = new Date()): Promise<boolean> {
    const delivery = await this.repository.claimDelivery(now);
    if (delivery === null) return false;
    try {
      const projections = projectNotificationEvent(delivery);
      await this.repository.insertProjections(projections);
      const completedAt = new Date();
      await this.repository.completeDelivery(delivery.eventId, projections.length, completedAt);
      this.logger.log({
        eventId: delivery.eventId,
        lagMilliseconds: Math.max(0, completedAt.getTime() - delivery.occurredAt.getTime()),
        notificationCount: projections.length,
        operation: 'notification_delivery_completed',
      });
    } catch (error: unknown) {
      const failedAt = new Date();
      const nextAttemptAt = retryAt(now, delivery.attemptCount);
      const errorCode = notificationErrorCode(error);
      await this.repository.failDelivery({
        errorCode,
        eventId: delivery.eventId,
        nextAttemptAt,
        now: failedAt,
      });
      this.logger.warn({
        errorCode,
        eventId: delivery.eventId,
        isTerminal: nextAttemptAt === null,
        operation: 'notification_delivery_failed',
      });
    }
    return true;
  }

  async maintain(now = new Date()): Promise<{ deletedCount: number; reconciledCount: number }> {
    let deletedCount = 0;
    for (let batch = 0; batch < 10; batch += 1) {
      const batchCount = await this.repository.deleteExpired(retainedAfter(now));
      deletedCount += batchCount;
      if (batchCount < 1_000) break;
    }
    const reconciledCount = await this.repository.reconcile(now);
    this.logger.log({ deletedCount, operation: 'notification_retention_completed' });
    if (reconciledCount > 0) {
      this.logger.warn({
        operation: 'notification_projection_reconciled',
        reconciledCount,
      });
    }
    return { deletedCount, reconciledCount };
  }

  private encodeCursor(cursor: NotificationCursor): string {
    return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
      'base64url',
    );
  }

  private decodeCursor(cursor: string | undefined): NotificationCursor | null {
    if (cursor === undefined) return null;
    try {
      const [createdAt, id] = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
      );
      return { createdAt: new Date(createdAt), id };
    } catch {
      throw new NotificationsError('INVALID_NOTIFICATION_CURSOR', 422);
    }
  }
}

function retainedAfter(now: Date): Date {
  return new Date(now.getTime() - RETENTION_MILLISECONDS);
}

function toResponse(notification: NotificationRecord) {
  return {
    createdAt: notification.createdAt.toISOString(),
    parameters: notification.parameters,
    publicId: notification.publicId,
    readAt: notification.readAt?.toISOString() ?? null,
    target: notification.target,
    targetDestination: notification.targetDestination,
    targetAvailable: notification.targetAvailable,
    type: notification.type,
  };
}

function retryAt(now: Date, attemptCount: number): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_SECONDS[Math.max(0, attemptCount - 1)] ?? 300;
  return new Date(now.getTime() + delay * 1_000);
}

function notificationErrorCode(error: unknown): string {
  return error instanceof z.ZodError
    ? 'NOTIFICATION_PAYLOAD_INVALID'
    : 'NOTIFICATION_DELIVERY_FAILED';
}
