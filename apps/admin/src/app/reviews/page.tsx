import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminReviewsCoreClient } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
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
      <header className="mb-8 flex max-w-4xl flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t('kicker')}</p>
        <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">{t('description')}</p>
      </header>
      {queue.items.length === 0 ? (
        <p className="rounded-surface border border-border bg-card p-8 text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-surface border border-border bg-border">
          {queue.items.map((item) => (
            <li
              className="grid gap-3 bg-card p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
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
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-input px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          className="mt-6 inline-flex min-h-11 items-center rounded-control border border-input px-4 text-sm font-medium"
          href={`/reviews?cursor=${encodeURIComponent(queue.nextCursor)}`}
        >
          {t('next')}
        </Link>
      )}
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
