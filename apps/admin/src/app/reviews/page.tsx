import { buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminReviewsCoreClient } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminWorkspacePage } from '../admin-workspace-page';
import { AdminWorkspaceShell } from '../admin-workspace-shell';

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const [state, t, query] = await Promise.all([
    getAdminAuthPageState(),
    getTranslations('Review'),
    searchParams,
  ]);
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  const queue = await new AdminReviewsCoreClient(getAdminServerEnvironment()).listQueue(
    sessionToken,
    { ...(query.cursor === undefined ? {} : { cursor: query.cursor }), limit: 20 },
  );

  return (
    <AdminWorkspaceShell activePage="reviews">
      <AdminWorkspacePage description={t('description')} eyebrow={t('kicker')} title={t('title')}>
        <div className="grid max-w-6xl gap-6">
          {queue.items.length === 0 ? (
            <p className="rounded-surface border border-border/80 bg-card p-8 text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <ul className="grid gap-px overflow-hidden rounded-surface border border-border/80 bg-border">
              {queue.items.map((item) => (
                <li
                  className="grid gap-4 bg-card p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  key={item.revisionPublicId}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">
                      {t('queue.revision', { number: item.number })}
                    </p>
                    {item.authorKind === 'admin_correction' ? (
                      <p className="mt-1 text-sm font-medium text-information">
                        {t('queue.adminCorrection')}
                      </p>
                    ) : null}
                    <h2 className="mt-1 truncate text-lg font-semibold">{item.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                      <span>{t('queue.submitter', { name: item.submitterAttributionName })}</span>
                      <time dateTime={item.submittedAt}>
                        {t('queue.submittedAt', { value: formatBangkokDate(item.submittedAt) })}
                      </time>
                    </div>
                  </div>
                  <Link
                    className={buttonVariants({ variant: 'outline' })}
                    href={`/reviews/${item.revisionPublicId}`}
                  >
                    {t('queue.view')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {queue.nextCursor === null ? null : (
            <Link
              className={buttonVariants({ className: 'w-fit', variant: 'outline' })}
              href={`/reviews?cursor=${encodeURIComponent(queue.nextCursor)}`}
            >
              {t('next')}
            </Link>
          )}
        </div>
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
