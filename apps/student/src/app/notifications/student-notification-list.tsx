import Link from 'next/link';
import type { StudentNotification } from '@/lib/student-notifications-core';

export function StudentNotificationList({
  items,
  labels,
  markReadAction,
  messages,
  visitorUrl,
}: {
  items: StudentNotification[];
  labels: { markRead: string; open: string; unavailable: string; unread: string };
  markReadAction: (publicId: string) => Promise<void>;
  messages: Readonly<Record<StudentNotification['type'], string>>;
  visitorUrl: string;
}) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-surface border border-border bg-border">
      {items.map((item) => {
        const targetPath = studentTargetPath(item, visitorUrl);
        return (
          <li
            className="grid gap-4 bg-card p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            key={item.publicId}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{messages[item.type]}</p>
                {item.readAt === null ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-sm font-medium text-primary-foreground">
                    {labels.unread}
                  </span>
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
                <Link
                  className="inline-flex min-h-11 items-center rounded-control border border-input px-4 text-sm font-medium"
                  href={targetPath}
                >
                  {labels.open}
                </Link>
              )}
              {item.readAt === null ? (
                <form action={markReadAction.bind(null, item.publicId)}>
                  <button
                    className="min-h-11 rounded-control border border-input px-4 text-sm font-medium"
                    type="submit"
                  >
                    {labels.markRead}
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function studentTargetPath(notification: StudentNotification, visitorUrl: string): string | null {
  if (notification.targetDestination === 'student_home') return '/';
  if (notification.targetDestination === 'student_invitations') return '/contributor-invitations';
  if (notification.targetDestination === 'student_work' && notification.target.kind === 'work') {
    return `/works/${notification.target.workPublicId}`;
  }
  if (notification.targetDestination === 'public_work' && notification.target.kind === 'work') {
    return `${visitorUrl}/works/${notification.target.workPublicId}`;
  }
  return null;
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
