import { Button, buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BellOffIcon, CheckCheckIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import {
  notificationTypeSchema,
  StudentNotificationsCoreClient,
} from '@/lib/student-notifications-core';
import {
  markAllStudentNotificationsReadAction,
  markStudentNotificationReadAction,
} from './notification.actions';
import { StudentNotificationList } from './student-notification-list';
import { StudentWorkspaceShell } from '../student-workspace-shell';
import { WorkspacePage } from '../workspace-page';

export default async function StudentNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; view?: string }>;
}) {
  const [auth, query, t] = await Promise.all([
    getStudentAuthPageState(),
    searchParams,
    getTranslations('Notifications'),
  ]);
  if (auth.kind !== 'active') redirect('/?expired=1');
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  const view = query.view === 'unread' ? 'unread' : 'all';
  const environment = getStudentServerEnvironment();
  const client = new StudentNotificationsCoreClient(environment);
  const [page, unread] = await Promise.all([
    client.list(sessionToken, {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: 20,
      view,
    }),
    client.countUnread(sessionToken),
  ]);
  const messages = Object.fromEntries(
    notificationTypeSchema.options.map((type) => [type, t(`types.${type}`)]),
  ) as Record<(typeof notificationTypeSchema.options)[number], string>;

  return (
    <StudentWorkspaceShell activePage="notifications">
      <WorkspacePage
        decoration={
          <div className="relative mt-3 hidden aspect-[4/3] max-h-80 w-full overflow-hidden rounded-surface border border-border/70 bg-card lg:block">
            <div className="absolute inset-8 rounded-full bg-primary/10 blur-3xl" />
            <Image
              alt=""
              className="object-contain object-bottom"
              fill
              sizes="(max-width: 1024px) 0px, 28vw"
              src="/images/notification-student.png"
            />
          </div>
        }
        description={t('description', { count: unread.count })}
        eyebrow={t('kicker')}
        title={t('title')}
      >
        <section aria-label={t('title')} className="grid content-start gap-6">
          <div className="flex flex-wrap items-center gap-2 rounded-surface border border-border/80 bg-card p-2">
            <Link
              aria-current={view === 'all' ? 'page' : undefined}
              className={buttonVariants({ variant: view === 'all' ? 'secondary' : 'ghost' })}
              href="/notifications"
            >
              {t('filters.all')}
            </Link>
            <Link
              aria-current={view === 'unread' ? 'page' : undefined}
              className={buttonVariants({ variant: view === 'unread' ? 'secondary' : 'ghost' })}
              href="/notifications?view=unread"
            >
              {t('filters.unread')}
            </Link>
            {unread.count > 0 ? (
              <form action={markAllStudentNotificationsReadAction}>
                <Button type="submit" variant="outline">
                  <CheckCheckIcon aria-hidden="true" />
                  {t('markAllRead')}
                </Button>
              </form>
            ) : null}
          </div>
          {page.items.length === 0 ? (
            <Card className="min-h-72 border-dashed bg-card/70">
              <CardHeader className="m-auto max-w-md justify-items-center gap-4 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
                  <BellOffIcon aria-hidden="true" className="size-7" />
                </span>
                <CardTitle>
                  <h2 className="text-xl">{t('fallbackTitle')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-8 text-center text-muted-foreground">
                {view === 'unread' ? t('emptyUnread') : t('empty')}
              </CardContent>
            </Card>
          ) : (
            <StudentNotificationList
              items={page.items}
              labels={{
                markRead: t('markRead'),
                open: t('open'),
                unavailable: t('unavailable'),
                unread: t('unread'),
              }}
              markReadAction={markStudentNotificationReadAction}
              messages={messages}
              visitorUrl={environment.visitorUrl}
            />
          )}
          {page.nextCursor === null ? null : (
            <Link
              className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
              href={`/notifications?view=${view}&cursor=${encodeURIComponent(page.nextCursor)}`}
            >
              {t('next')}
            </Link>
          )}
        </section>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}
