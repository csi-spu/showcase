import { Button } from '@showcase/ui/button';
import {
  BellIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import type {
  StudentCollectionNotification,
  StudentCollectionNotificationKind,
} from '@/lib/student-collection-forms-core';

/* One icon per kind, so the reason for a notification reads before the text does. */
const KIND_ICONS: Record<StudentCollectionNotificationKind, typeof BellIcon> = {
  changes_requested: RotateCcwIcon,
  deadline_reminder: CalendarClockIcon,
  obligation_assigned: ClipboardListIcon,
  submission_passed: CircleCheckIcon,
};

const KIND_TONES: Record<StudentCollectionNotificationKind, 'information' | 'success' | 'warning'> =
  {
    changes_requested: 'warning',
    deadline_reminder: 'warning',
    obligation_assigned: 'information',
    submission_passed: 'success',
  };

export async function NotificationsPanel({
  markReadAction,
  notifications,
  unreadCount,
}: {
  markReadAction: () => Promise<void>;
  notifications: StudentCollectionNotification[];
  unreadCount: number;
}) {
  const t = await getTranslations('Notifications');
  const format = await getFormatter();

  return (
    <section
      aria-labelledby="notifications-heading"
      className="flex flex-col gap-3 rounded-surface border border-border/80 bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
          id="notifications-heading"
        >
          <BellIcon aria-hidden="true" className="size-5 text-primary" />
          {t('title')}
          {unreadCount === 0 ? null : (
            <StatusBadge tone="information">{t('unread', { count: unreadCount })}</StatusBadge>
          )}
        </h2>
        {unreadCount === 0 ? null : (
          <form action={markReadAction}>
            <Button size="sm" type="submit" variant="outline">
              {t('markAllRead')}
            </Button>
          </form>
        )}
      </div>
      {notifications.length === 0 ? (
        <EmptyState icon={BellIcon} title={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const Icon = KIND_ICONS[notification.kind];
            return (
              <li
                className={`flex items-start gap-3 rounded-surface border p-3.5 ${
                  notification.isRead ? 'border-border bg-card' : 'border-input bg-accent/40'
                }`}
                key={notification.id}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={KIND_TONES[notification.kind]}>
                      {t(`kind.${notification.kind}`)}
                    </StatusBadge>
                    {notification.isRead ? null : (
                      <span className="sr-only">{t('unreadItem')}</span>
                    )}
                  </span>
                  <span className="font-medium text-foreground">{notification.formTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    {/* Rendered in Asia/Bangkok, which the formatter is configured for. */}
                    {format.dateTime(new Date(notification.createdAt), {
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
