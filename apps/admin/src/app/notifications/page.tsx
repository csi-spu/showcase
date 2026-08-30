import { Button, buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ArrowRightIcon, BellIcon, CheckCheckIcon, InboxIcon } from 'lucide-react';
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
import { AdminWorkspacePage } from '../admin-workspace-page';
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
      <AdminWorkspacePage
        description={t('description', { count: unread.count })}
        eyebrow={t('kicker')}
        title={t('title')}
      >
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Link
            aria-current={view === 'all' ? 'page' : undefined}
            className={cn(buttonVariants({ variant: view === 'all' ? 'default' : 'outline' }))}
            href="/notifications"
          >
            <InboxIcon aria-hidden="true" data-icon="inline-start" />
            {t('filters.all')}
          </Link>
          <Link
            aria-current={view === 'unread' ? 'page' : undefined}
            className={cn(buttonVariants({ variant: view === 'unread' ? 'default' : 'outline' }))}
            href="/notifications?view=unread"
          >
            <BellIcon aria-hidden="true" data-icon="inline-start" />
            {t('filters.unread')}
          </Link>
          {unread.count > 0 ? (
            <form action={markAllAdminNotificationsReadAction} className="ml-auto">
              <Button type="submit" variant="outline">
                <CheckCheckIcon aria-hidden="true" data-icon="inline-start" />
                {t('markAllRead')}
              </Button>
            </form>
          ) : null}
        </div>
        {page.items.length === 0 ? (
          <p className="rounded-surface border border-dashed border-border p-8 text-muted-foreground">
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
            className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}
            href={`/notifications?view=${view}&cursor=${encodeURIComponent(page.nextCursor)}`}
          >
            {t('next')}
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Link>
        )}
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}
