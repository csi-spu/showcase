import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import {
  AdminNotificationsCoreClient,
  notificationTypeSchema,
} from '@/lib/admin-notifications-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminWorkspaceShell } from '../admin-workspace-shell';
import { AdminNotificationList } from './admin-notification-list';
import {
  markAdminNotificationReadAction,
  markAllAdminNotificationsReadAction,
} from './notification.actions';

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; view?: string }>;
}) {
  const [auth, query, t] = await Promise.all([
    getAdminAuthPageState(),
    searchParams,
    getTranslations('Notifications'),
  ]);
  if (auth.kind !== 'active') redirect(auth.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  const view = query.view === 'unread' ? 'unread' : 'all';
  const client = new AdminNotificationsCoreClient(getAdminServerEnvironment());
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
    <AdminWorkspaceShell activePage="notifications">
      <header className="mb-8 flex max-w-4xl flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t('kicker')}</p>
        <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('description', { count: unread.count })}</p>
      </header>
      <div className="mb-6 flex flex-wrap items-center gap-2">
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
          <form action={markAllAdminNotificationsReadAction}>
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
        <AdminNotificationList
          items={page.items}
          labels={{
            markRead: t('markRead'),
            open: t('open'),
            unavailable: t('unavailable'),
            unread: t('unread'),
          }}
          markReadAction={markAdminNotificationReadAction}
          messages={messages}
        />
      )}
      {page.nextCursor === null ? null : (
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-control border border-input px-4 text-sm font-medium"
          href={`/notifications?view=${view}&cursor=${encodeURIComponent(page.nextCursor)}`}
        >
          {t('next')}
        </Link>
      )}
    </AdminWorkspaceShell>
  );
}
