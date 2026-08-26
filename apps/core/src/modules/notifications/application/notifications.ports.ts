import type {
  NotificationAudience,
  NotificationParameters,
  NotificationProjection,
  NotificationTarget,
  NotificationType,
} from '../domain/notification-event';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

export interface NotificationRecord {
  createdAt: Date;
  id: string;
  parameters: NotificationParameters;
  publicId: string;
  readAt: Date | null;
  target: NotificationTarget;
  targetDestination:
    'admin_roster' | 'public_work' | 'student_home' | 'student_invitations' | 'student_work' | null;
  targetAvailable: boolean;
  type: NotificationType;
}

export interface NotificationDelivery {
  attemptCount: number;
  eventId: number;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
}

export interface NotificationRepository {
  claimDelivery(now: Date): Promise<NotificationDelivery | null>;
  completeDelivery(eventId: number, projectedCount: number, now: Date): Promise<void>;
  countUnread(input: {
    accountId: string;
    audience: NotificationAudience;
    retainedAfter: Date;
  }): Promise<number>;
  deleteExpired(retainedAfter: Date): Promise<number>;
  failDelivery(input: {
    errorCode: string;
    eventId: number;
    nextAttemptAt: Date | null;
    now: Date;
  }): Promise<void>;
  insertProjections(projections: readonly NotificationProjection[]): Promise<void>;
  list(input: {
    accountId: string;
    audience: NotificationAudience;
    cursor: NotificationCursor | null;
    limit: number;
    retainedAfter: Date;
    view: 'all' | 'unread';
  }): Promise<{ items: NotificationRecord[]; nextCursor: NotificationCursor | null }>;
  markAllRead(input: {
    accountId: string;
    audience: NotificationAudience;
    cutoff: Date;
  }): Promise<number>;
  markRead(input: {
    accountId: string;
    audience: NotificationAudience;
    notificationPublicId: string;
    now: Date;
  }): Promise<NotificationRecord | null>;
  reconcile(now: Date): Promise<number>;
}
