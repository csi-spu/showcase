import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
    <StudentWorkspaceShell
      activePage="notifications"
      canCreateWork={auth.session.canUseStudentCapabilities}
    >
      <div className="grid gap-8 lg:grid-cols-12">
        <header className="grid content-start gap-3 lg:col-span-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">{t('kicker')}</p>
          <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description', { count: unread.count })}</p>
        </header>
        <section aria-label={t('title')} className="grid content-start gap-6 lg:col-span-8">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              aria-current={view === 'all' ? 'page' : undefined}
              className="inline-flex min-h-11 items-center rounded-control border border-input px-4 text-sm font-medium"
              href="/notifications"
            >
              {t('filters.all')}
            </Link>
            <Link
              aria-current={view === 'unread' ? 'page' : undefined}
              className="inline-flex min-h-11 items-center rounded-control border border-input px-4 text-sm font-medium"
              href="/notifications?view=unread"
            >
              {t('filters.unread')}
            </Link>
            {unread.count > 0 ? (
              <form action={markAllStudentNotificationsReadAction}>
                <button
                  className="min-h-11 rounded-control border border-input px-4 text-sm font-medium"
                  type="submit"
                >
                  {t('markAllRead')}
                </button>
              </form>
            ) : null}
          </div>
          {page.items.length === 0 ? (
            <p className="rounded-surface border border-border bg-card p-8 text-muted-foreground">
              {view === 'unread' ? t('emptyUnread') : t('empty')}
            </p>
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
              className="inline-flex min-h-11 w-fit items-center rounded-control border border-input px-4 text-sm font-medium"
              href={`/notifications?view=${view}&cursor=${encodeURIComponent(page.nextCursor)}`}
            >
              {t('next')}
            </Link>
          )}
        </section>
      </div>
    </StudentWorkspaceShell>
  );
}
