import { Button, buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import { BellRingIcon, CheckIcon, ExternalLinkIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
    <ul className="grid auto-rows-fr gap-4 sm:grid-cols-2">
      {items.map((item) => {
        const targetPath = studentTargetPath(item, visitorUrl);
        return (
          <li
            className="grid min-h-48 gap-4 rounded-surface border border-border/80 bg-card p-5 shadow-sm sm:grid-rows-[1fr_auto]"
            key={item.publicId}
          >
            <div className="grid min-w-0 content-start gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
                  {item.readAt === null ? (
                    <BellRingIcon aria-hidden="true" className="size-4" />
                  ) : (
                    <CheckIcon aria-hidden="true" className="size-4" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <p className="font-medium">{messages[item.type]}</p>
                  {item.readAt === null ? <Badge>{labels.unread}</Badge> : null}
                </div>
              </div>
              {typeof item.parameters.title === 'string' ? (
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {item.parameters.title}
                </p>
              ) : null}
              <time className="block text-sm text-muted-foreground" dateTime={item.createdAt}>
                {formatBangkokDate(item.createdAt)}
              </time>
            </div>
            <div className="flex min-h-11 flex-wrap items-end gap-2 border-t border-border/70 pt-4">
              {targetPath === null ? (
                <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
                  {labels.unavailable}
                </span>
              ) : (
                <Link className={buttonVariants({ variant: 'outline' })} href={targetPath}>
                  {labels.open}
                  <ExternalLinkIcon aria-hidden="true" />
                </Link>
              )}
              {item.readAt === null ? (
                <form action={markReadAction.bind(null, item.publicId)}>
                  <Button type="submit" variant="ghost">
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

function studentTargetPath(notification: StudentNotification, visitorUrl: string): string | null {
  if (notification.targetDestination === 'student_home') return '/';
  if (notification.targetDestination === 'student_invitations') return null;
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
