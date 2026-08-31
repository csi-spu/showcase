import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilePlus2Icon,
  FolderSearchIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { StudentWorkspaceShell } from '../student-workspace-shell';
import { WorkspacePage } from '../workspace-page';
import { StudentWorkList } from './student-work-list';
import {
  type WorkListCategory,
  WorkListControls,
  type WorkListSort,
  type WorkListStatus,
} from './work-list-controls';
import { getPaginationItems } from './work-pagination';

export default async function StudentWorksPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    page?: string | string[];
    query?: string | string[];
    sort?: string | string[];
    status?: string | string[];
    view?: string | string[];
  }>;
}) {
  const [auth, query, t] = await Promise.all([
    getStudentAuthPageState(),
    searchParams,
    getTranslations('MyWorks'),
  ]);
  if (auth.kind !== 'active') redirect('/?expired=1');
  const token = await readStudentSessionToken();
  if (token === null) redirect('/?expired=1');
  const view = query.view === 'saved' ? ('saved' as const) : ('current' as const);
  const searchQuery = typeof query.query === 'string' ? query.query.slice(0, 100) : '';
  const category = parseCategory(query.category);
  const status = parseStatus(query.status);
  const sort = query.sort === 'updated_asc' ? ('updated_asc' as const) : ('updated_desc' as const);
  const requestedPage = parsePage(query.page);
  const environment = getStudentServerEnvironment();
  const page = await new StudentWorksCoreClient(environment).listWorks(token, {
    category,
    page: requestedPage,
    query: searchQuery,
    sort,
    status,
    view,
  });
  const currentPage = page.currentPage;
  const canEdit = auth.session.canUseStudentCapabilities;
  const labels = {
    actionErrorConflict: t('actionErrorConflict'),
    actionErrorUnavailable: t('actionErrorUnavailable'),
    archiveConfirm: t('archiveConfirm'),
    more: t('more'),
    placeholder: t('placeholder'),
    posterFallback: t('posterFallback'),
    updatedAt: t('updatedAt'),
    'actions.archive_saved_draft': t('actions.archive_saved_draft'),
    'actions.continue_editing': t('actions.continue_editing'),
    'actions.create_new_revision': t('actions.create_new_revision'),
    'actions.return_to_editing': t('actions.return_to_editing'),
    'actions.view_details': t('actions.view_details'),
    'actions.view_public_work': t('actions.view_public_work'),
    'actions.withdraw_submission': t('actions.withdraw_submission'),
    'activity.active': t('activity.active'),
    'activity.archived': t('activity.archived'),
    'publication.never_published': t('publication.never_published'),
    'publication.published': t('publication.published'),
    'publication.unpublished': t('publication.unpublished'),
    'review.approved': t('review.approved'),
    'review.changes_requested': t('review.changes_requested'),
    'review.draft': t('review.draft'),
    'review.none': t('review.none'),
    'review.pending_review': t('review.pending_review'),
    'review.withdrawn': t('review.withdrawn'),
    'source.draft': t('source.draft'),
    'source.pending_revision': t('source.pending_revision'),
    'source.placeholder': t('source.placeholder'),
    'source.published_revision': t('source.published_revision'),
  };
  const controlValue = {
    category,
    page: currentPage,
    query: searchQuery,
    sort,
    status,
    view,
  };
  return (
    <StudentWorkspaceShell activePage="works">
      <WorkspacePage
        description={t('description')}
        eyebrow={t('eyebrow')}
        layout="authoring"
        title={t('title')}
      >
        <section className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2 rounded-surface border border-border/80 bg-card p-2">
            <Link
              className={cn(
                buttonVariants({ variant: view === 'current' ? 'default' : 'outline' }),
              )}
              href="/works?view=current"
            >
              {t('views.current')}
            </Link>
            <Link
              className={cn(buttonVariants({ variant: view === 'saved' ? 'default' : 'outline' }))}
              href="/works?view=saved"
            >
              {t('views.saved')}
            </Link>
            {canEdit ? (
              <Link className={cn(buttonVariants(), 'ml-auto')} href="/works/new">
                <FilePlus2Icon aria-hidden="true" data-icon="inline-start" />
                {t('create')}
              </Link>
            ) : null}
          </div>
          <WorkListControls
            labels={{
              category: t('filters.category'),
              categoryAll: t('filters.categoryAll'),
              categoryAcademicArticle: t('filters.categoryAcademicArticle'),
              categoryCompetitionEntry: t('filters.categoryCompetitionEntry'),
              categoryCourseWork: t('filters.categoryCourseWork'),
              search: t('filters.search'),
              searchPlaceholder: t('filters.searchPlaceholder'),
              sort: t('filters.sort'),
              sortNewest: t('filters.sortNewest'),
              sortOldest: t('filters.sortOldest'),
              status: t('filters.status'),
              statusAll: t('filters.statusAll'),
              statusChangesRequested: t('filters.statusChangesRequested'),
              statusDraft: t('filters.statusDraft'),
              statusPendingReview: t('filters.statusPendingReview'),
              statusPublished: t('filters.statusPublished'),
            }}
            value={controlValue}
          />
          {!canEdit ? <p className="rounded-surface border bg-muted p-4">{t('readOnly')}</p> : null}
          {page.items.length === 0 ? (
            <div className="grid min-h-64 place-items-center rounded-surface border border-dashed bg-card/70 p-10 text-center">
              <div className="grid max-w-md justify-items-center gap-3 text-muted-foreground">
                <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
                  <FolderSearchIcon aria-hidden="true" className="size-6" />
                </span>
                <p>
                  {searchQuery !== '' || category !== 'all' || status !== 'all'
                    ? t('emptyFiltered')
                    : t(view === 'saved' ? 'emptySaved' : 'empty')}
                </p>
              </div>
            </div>
          ) : (
            <StudentWorkList
              canEdit={canEdit}
              items={page.items}
              labels={labels}
              visitorUrl={environment.visitorUrl}
            />
          )}
          <nav
            aria-label={t('pagination')}
            className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border/80 bg-card p-3"
          >
            {currentPage <= 1 ? (
              <span
                aria-disabled="true"
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'pointer-events-none opacity-50',
                )}
              >
                <ChevronLeftIcon aria-hidden="true" />
                {t('previous')}
              </span>
            ) : (
              <Link
                className={buttonVariants({ variant: 'outline' })}
                href={buildWorksHref(controlValue, currentPage - 1)}
              >
                <ChevronLeftIcon aria-hidden="true" />
                {t('previous')}
              </Link>
            )}
            <div className="flex flex-wrap items-center justify-center gap-1">
              {getPaginationItems(currentPage, page.totalPages).map((item) =>
                typeof item === 'number' ? (
                  <Link
                    aria-current={item === currentPage ? 'page' : undefined}
                    className={cn(
                      buttonVariants({
                        size: 'icon-sm',
                        variant: item === currentPage ? 'default' : 'ghost',
                      }),
                      'transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none',
                    )}
                    href={buildWorksHref(controlValue, item)}
                    key={item}
                  >
                    <span className="sr-only">{t('page')}</span>
                    {item}
                  </Link>
                ) : (
                  <span className="grid size-9 place-items-center text-muted-foreground" key={item}>
                    <MoreHorizontalIcon aria-hidden="true" className="size-4" />
                    <span className="sr-only">{t('ellipsis')}</span>
                  </span>
                ),
              )}
              <p className="ml-2 text-sm text-muted-foreground" aria-live="polite">
                {t('pageSummary', {
                  current: page.totalPages === 0 ? 0 : currentPage,
                  pages: page.totalPages,
                  total: page.totalItems,
                })}
              </p>
            </div>
            {currentPage < page.totalPages ? (
              <Link
                className={buttonVariants({ variant: 'outline' })}
                href={buildWorksHref(controlValue, currentPage + 1)}
              >
                {t('next')}
                <ChevronRightIcon aria-hidden="true" />
              </Link>
            ) : null}
            {currentPage >= page.totalPages ? (
              <span
                aria-disabled="true"
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'pointer-events-none opacity-50',
                )}
              >
                {t('next')}
                <ChevronRightIcon aria-hidden="true" />
              </span>
            ) : null}
          </nav>
        </section>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}

function parseCategory(value: string | string[] | undefined): WorkListCategory {
  return ['academic_article', 'competition_entry', 'course_work'].includes(String(value))
    ? (value as WorkListCategory)
    : 'all';
}

function parseStatus(value: string | string[] | undefined): WorkListStatus {
  return ['changes_requested', 'draft', 'pending_review', 'published'].includes(String(value))
    ? (value as WorkListStatus)
    : 'all';
}

function parsePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) return 1;
  return Math.max(1, Number(value));
}

function buildWorksHref(
  value: {
    category: WorkListCategory;
    query: string;
    sort: WorkListSort;
    status: WorkListStatus;
    view: 'current' | 'saved';
  },
  page: number,
): string {
  const params = new URLSearchParams({ view: value.view });
  if (value.query !== '') params.set('query', value.query);
  if (value.category !== 'all') params.set('category', value.category);
  if (value.status !== 'all') params.set('status', value.status);
  if (value.sort !== 'updated_desc') params.set('sort', value.sort);
  if (page > 1) params.set('page', String(page));
  return `/works?${params.toString()}`;
}
