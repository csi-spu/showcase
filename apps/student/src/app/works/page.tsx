import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { StudentWorkspaceShell } from '../student-workspace-shell';
import { WorkspacePage } from '../workspace-page';
import { StudentWorkList } from './student-work-list';

export default async function StudentWorksPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[]; view?: string | string[] }>;
}) {
  const [auth, query, t] = await Promise.all([
    getStudentAuthPageState(),
    searchParams,
    getTranslations('MyWorks'),
  ]);
  if (auth.kind !== 'active') redirect('/?expired=1');
  const token = await readStudentSessionToken();
  if (token === null) redirect('/?expired=1');
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  const view = query.view === 'saved' ? ('saved' as const) : ('current' as const);
  const environment = getStudentServerEnvironment();
  const page = await new StudentWorksCoreClient(environment).listWorks(token, {
    ...(cursor === undefined ? {} : { cursor }),
    view,
  });
  const canEdit = auth.session.canUseStudentCapabilities;
  const labels = {
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
  return (
    <StudentWorkspaceShell activePage="works" canCreateWork={canEdit}>
      <WorkspacePage
        description={t('description')}
        eyebrow={t('eyebrow')}
        layout="authoring"
        title={t('title')}
      >
        <section className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2">
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
                {t('create')}
              </Link>
            ) : null}
          </div>
          {!canEdit ? <p className="rounded-surface border bg-muted p-4">{t('readOnly')}</p> : null}
          {page.items.length === 0 ? (
            <p className="rounded-surface border border-dashed p-10 text-center">
              {t(view === 'saved' ? 'emptySaved' : 'empty')}
            </p>
          ) : (
            <StudentWorkList
              canEdit={canEdit}
              items={page.items}
              labels={labels}
              visitorUrl={environment.visitorUrl}
            />
          )}
          <nav aria-label={t('pagination')} className="flex justify-between">
            {page.previousCursor === null ? (
              <span />
            ) : (
              <Link
                className={buttonVariants({ variant: 'outline' })}
                href={`/works?view=${view}&cursor=${encodeURIComponent(page.previousCursor)}`}
              >
                {t('previous')}
              </Link>
            )}
            {page.nextCursor === null ? null : (
              <Link
                className={buttonVariants({ variant: 'outline' })}
                href={`/works?view=${view}&cursor=${encodeURIComponent(page.nextCursor)}`}
              >
                {t('next')}
              </Link>
            )}
          </nav>
        </section>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}
