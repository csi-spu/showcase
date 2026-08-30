import { buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
            <Table aria-label={t('queue.tableLabel')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('queue.columns.work')}</TableHead>
                  <TableHead>{t('queue.columns.submitter')}</TableHead>
                  <TableHead>{t('queue.columns.submittedAt')}</TableHead>
                  <TableHead>{t('queue.columns.status')}</TableHead>
                  <TableHead className="text-right">{t('queue.columns.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.items.map((item) => (
                  <TableRow key={item.revisionPublicId}>
                    <TableCell className="max-w-md">
                      <h2 className="line-clamp-2 font-semibold">{item.title}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {t('queue.revision', { number: item.number })}
                        </Badge>
                        {item.authorKind === 'admin_correction' ? (
                          <Badge className="text-information" variant="secondary">
                            {t('queue.adminCorrection')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{item.submitterAttributionName}</TableCell>
                    <TableCell>
                      <time dateTime={item.submittedAt}>{formatBangkokDate(item.submittedAt)}</time>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t('queue.pending')}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        className={buttonVariants({ size: 'sm', variant: 'outline' })}
                        href={`/reviews/${item.revisionPublicId}`}
                      >
                        {t('queue.view')}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
