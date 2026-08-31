import { randomUUID } from 'node:crypto';
import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  ArrowRightIcon,
  EyeIcon,
  FilePenLineIcon,
  FilterIcon,
  RotateCcwIcon,
  SearchIcon,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ActionGroup } from '@/components/ui/action-group';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
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
import { AttributionRemovalDecisionForm, RecoveryDecisionForm } from '../recovery/recovery-forms';
import {
  decideAttributionRemovalRequestAction,
  decideRemovalRequestAction,
} from '../recovery/recovery.actions';
import {
  resolveWorkManagementView,
  WORK_MANAGEMENT_VIEWS,
  workManagementHref,
} from './work-management-view';

export default async function WorkManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string; view?: string }>;
}) {
  const [authState, query, t] = await Promise.all([
    getAdminAuthPageState(),
    searchParams,
    getTranslations('WorkManagement'),
  ]);
  if (authState.kind !== 'active') redirect(authState.kind === 'expired' ? '/?expired=1' : '/');
  const token = await readAdminSessionToken();
  if (token === null) redirect('/?expired=1');

  const view = resolveWorkManagementView(query.view);
  const search = view === 'published' ? query.q?.trim() || undefined : undefined;
  const core = new AdminReviewsCoreClient(getAdminServerEnvironment());
  const reviews =
    view === 'reviews'
      ? await core.listQueue(token, {
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: 20,
        })
      : null;
  const removals = view === 'removals' ? await core.listRemovalRequests(token, 20) : null;
  const attributions =
    view === 'attributions'
      ? await core.listAttributionRemovalRequests(token, {
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: 20,
        })
      : null;
  const published =
    view === 'published'
      ? await core.listPublishedWorks({
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: 20,
          ...(search === undefined ? {} : { q: search }),
        })
      : null;
  const isEmpty =
    (reviews?.items.length ??
      removals?.items.length ??
      attributions?.items.length ??
      published?.items.length) === 0;
  const nextCursor =
    reviews?.nextCursor ?? attributions?.nextCursor ?? published?.nextCursor ?? null;

  return (
    <AdminWorkspaceShell activePage="works">
      <AdminWorkspacePage description={t('description')} eyebrow={t('kicker')} title={t('title')}>
        <div className="grid max-w-7xl gap-5">
          <section
            aria-label={t('filterLabel')}
            className="grid gap-4 rounded-surface border border-border/80 bg-card p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <FilterIcon aria-hidden="true" className="size-4 text-primary" />
              <span>{t('filterLabel')}</span>
            </div>
            <nav aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
              {WORK_MANAGEMENT_VIEWS.map((filterView) => (
                <Link
                  aria-current={view === filterView ? 'page' : undefined}
                  className={buttonVariants({
                    size: 'sm',
                    variant: view === filterView ? 'default' : 'outline',
                  })}
                  href={workManagementHref(filterView)}
                  key={filterView}
                >
                  {t(`views.${filterView}`)}
                </Link>
              ))}
            </nav>
            {view === 'published' ? (
              <form className="flex w-full gap-2 sm:max-w-xl" method="get">
                <input name="view" type="hidden" value="published" />
                <Input
                  aria-label={t('search.label')}
                  className="min-w-0"
                  defaultValue={search ?? ''}
                  name="q"
                  placeholder={t('search.placeholder')}
                />
                <button
                  aria-label={t('search.submit')}
                  className={buttonVariants({ size: 'icon', variant: 'outline' })}
                  title={t('search.submit')}
                  type="submit"
                >
                  <SearchIcon aria-hidden="true" />
                </button>
              </form>
            ) : null}
          </section>

          <Table aria-label={t('tableLabel')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.work')}</TableHead>
                <TableHead>{t('columns.details')}</TableHead>
                <TableHead>{t('columns.updatedAt')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="w-40 text-right">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmpty ? (
                <TableRow>
                  <TableCell className="h-32 text-center text-muted-foreground" colSpan={5}>
                    {t(`empty.${view}`)}
                  </TableCell>
                </TableRow>
              ) : null}
              {reviews?.items.map((item) => (
                <TableRow key={item.revisionPublicId}>
                  <TableCell className="max-w-md">
                    <h2 className="line-clamp-2 font-semibold">{item.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {t('review.revision', { number: item.number })}
                      </Badge>
                      {item.authorKind === 'admin_correction' ? (
                        <Badge className="text-information" variant="secondary">
                          {t('review.adminCorrection')}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p>{t('review.submittedBy', { name: item.submitterAttributionName })}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`categories.${item.category}`)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <time dateTime={item.submittedAt}>{formatBangkokDate(item.submittedAt)}</time>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone="warning">{t('statuses.pendingReview')}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionGroup>
                      <IconActionLink
                        href={`/reviews/${item.revisionPublicId}`}
                        label={t('actions.review')}
                      >
                        <EyeIcon aria-hidden="true" />
                      </IconActionLink>
                    </ActionGroup>
                  </TableCell>
                </TableRow>
              ))}
              {removals?.items.map((request) => (
                <TableRow key={request.publicId}>
                  <TableCell className="max-w-md">
                    <h2 className="line-clamp-2 font-semibold">{request.title}</h2>
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-pre-wrap text-muted-foreground">
                    {request.reason}
                  </TableCell>
                  <TableCell>
                    <time dateTime={request.createdAt}>{formatBangkokDate(request.createdAt)}</time>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone="warning">{t('statuses.pendingRemoval')}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start justify-end gap-2">
                      <IconActionLink
                        href={`/recovery/${request.workPublicId}`}
                        label={t('actions.viewRequest')}
                      >
                        <EyeIcon aria-hidden="true" />
                      </IconActionLink>
                      <RecoveryDecisionForm
                        action={decideRemovalRequestAction.bind(
                          null,
                          request.publicId,
                          request.workPublicId,
                        )}
                        iconOnly
                        idempotencyKey={randomUUID()}
                        request={request}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {attributions?.items.map((request) => (
                <TableRow key={request.publicId}>
                  <TableCell className="max-w-md">
                    <h2 className="line-clamp-2 font-semibold">{request.workTitle}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{request.attributionName}</p>
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-pre-wrap text-muted-foreground">
                    {request.reason}
                  </TableCell>
                  <TableCell>
                    <time dateTime={request.createdAt}>{formatBangkokDate(request.createdAt)}</time>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone="warning">{t('statuses.pendingAttribution')}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <AttributionRemovalDecisionForm
                        action={decideAttributionRemovalRequestAction.bind(null, request.publicId)}
                        iconOnly
                        idempotencyKey={randomUUID()}
                        request={request}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {published?.items.map((work) => (
                <TableRow key={work.workPublicId}>
                  <TableCell className="max-w-md">
                    <h2 className="line-clamp-2 font-semibold">{work.title}</h2>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {work.summary}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-2">{work.attributions.join(', ') || '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('published.academicPeriod', {
                        semester: t(`semesters.${work.academicPeriod.semester}`),
                        year: work.academicPeriod.year,
                      })}
                    </p>
                  </TableCell>
                  <TableCell>
                    <time dateTime={work.publishedAt}>{formatBangkokDate(work.publishedAt)}</time>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone="success">{t('statuses.published')}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <ActionGroup>
                      <IconActionLink
                        href={`/corrections/${work.workPublicId}`}
                        label={t('actions.edit')}
                      >
                        <FilePenLineIcon aria-hidden="true" />
                      </IconActionLink>
                      <IconActionLink
                        href={`/recovery/${work.workPublicId}`}
                        label={t('actions.manageVisibility')}
                      >
                        <RotateCcwIcon aria-hidden="true" />
                      </IconActionLink>
                    </ActionGroup>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {nextCursor === null ? null : (
            <Link
              className={buttonVariants({ className: 'w-fit', variant: 'outline' })}
              href={workManagementHref(view, {
                cursor: nextCursor,
                ...(search === undefined ? {} : { q: search }),
              })}
            >
              {t('next')}
              <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </Link>
          )}
        </div>
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}

function IconActionLink({
  children,
  href,
  label,
}: {
  children: ReactNode;
  href: string;
  label: string;
}) {
  return (
    <ActionTooltip label={label}>
      <Link
        aria-label={label}
        className={cn(buttonVariants({ size: 'icon-sm', variant: 'outline' }), 'text-primary')}
        href={href}
        title={label}
      >
        {children}
      </Link>
    </ActionTooltip>
  );
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
