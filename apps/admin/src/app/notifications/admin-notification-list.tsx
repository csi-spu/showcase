import { Button, buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import type { AdminNotification } from '@/lib/admin-notifications-core';

export function AdminNotificationList({
  items,
  labels,
  markReadAction,
  messages,
}: {
  items: AdminNotification[];
  labels: { markRead: string; open: string; unavailable: string; unread: string };
  markReadAction: (publicId: string) => Promise<void>;
  messages: Readonly<Record<AdminNotification['type'], string>>;
}) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-surface border border-border bg-border">
      {items.map((item) => {
        const targetPath = adminTargetPath(item);
        return (
          <li
            className={cn(
              'grid gap-4 bg-card p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
              item.readAt === null && 'border-l-2 border-primary bg-primary-soft/40',
            )}
            key={item.publicId}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{messages[item.type]}</p>
                {item.readAt === null ? (
                  <StatusBadge className="px-2 py-0.5" icon={false} tone="primary">
                    {labels.unread}
                  </StatusBadge>
                ) : null}
              </div>
              {typeof item.parameters.title === 'string' ? (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {item.parameters.title}
                </p>
              ) : null}
              <time className="mt-2 block text-sm text-muted-foreground" dateTime={item.createdAt}>
                {formatBangkokDate(item.createdAt)}
              </time>
            </div>
            <div className="flex flex-wrap gap-2">
              {targetPath === null ? (
                <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
                  {labels.unavailable}
                </span>
              ) : (
                <Link className={buttonVariants({ variant: 'outline' })} href={targetPath}>
                  {labels.open}
                </Link>
              )}
              {item.readAt === null ? (
                <form action={markReadAction.bind(null, item.publicId)}>
                  <Button type="submit" variant="outline">
                    {labels.markRead}
                  </Button>
                </form>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function adminTargetPath(notification: AdminNotification): string | null {
  if (notification.targetDestination !== 'admin_roster') return null;
  return notification.target.kind === 'roster_batch'
    ? `/roster?batchId=${encodeURIComponent(notification.target.batchId)}`
    : '/roster';
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
