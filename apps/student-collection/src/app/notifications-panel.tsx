import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  BellIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  RotateCcwIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
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

/* The icon carries the kind's tone, so the list reads without a badge on every row. */
const KIND_ICON_TONES: Record<StudentCollectionNotificationKind, string> = {
  changes_requested: 'bg-warning-background text-warning',
  deadline_reminder: 'bg-warning-background text-warning',
  obligation_assigned: 'bg-information-background text-information',
  submission_passed: 'bg-success-background text-success',
};

/**
 * The notification feed, as shown inside the header bell's dropdown. Marking
 * read stays an explicit action: opening the dropdown is not reading it.
 */
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
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            className="font-semibold tracking-tight whitespace-nowrap text-foreground"
            id="notifications-heading"
          >
            {t('title')}
          </h2>
          {unreadCount === 0 ? null : (
            <p className="truncate text-xs text-muted-foreground">
              {t('unread', { count: unreadCount })}
            </p>
          )}
        </div>
        {unreadCount === 0 ? null : (
          <form action={markReadAction} className="shrink-0">
            <Button className="-me-2 text-primary" size="xs" type="submit" variant="ghost">
              <CheckCheckIcon aria-hidden="true" />
              {t('markAllRead')}
            </Button>
          </form>
        )}
      </div>
      {notifications.length === 0 ? (
        <EmptyState className="m-3 border-0 py-8" icon={BellIcon} title={t('empty')} />
      ) : (
        <ul className="flex min-h-0 flex-col divide-y divide-border/60 overflow-y-auto overscroll-contain">
          {notifications.map((notification) => {
            const Icon = KIND_ICONS[notification.kind];
            return (
              <li key={notification.id}>
                {/* Each notification is about one form, so it opens that form. */}
                <Link
                  className={cn(
                    'group flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none',
                    notification.isRead ? null : 'bg-primary-soft/40',
                  )}
                  href={`/forms/${notification.formId}`}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none',
                      KIND_ICON_TONES[notification.kind],
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        'line-clamp-2 text-sm text-foreground',
                        notification.isRead ? 'font-normal' : 'font-semibold',
                      )}
                    >
                      {notification.formTitle}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t(`kind.${notification.kind}`)}
                      {' · '}
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
                  {notification.isRead ? null : (
                    <>
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                      />
                      <span className="sr-only">{t('unreadItem')}</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
