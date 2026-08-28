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
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const [auth, query, t] = await Promise.all([
    getStudentAuthPageState(),
    searchParams,
    getTranslations('MyWorks'),
  ]);
  if (auth.kind !== 'active') redirect('/?expired=1');
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  const page = await new StudentWorksCoreClient(getStudentServerEnvironment()).listWorks(
    sessionToken,
    { ...(cursor === undefined ? {} : { cursor }), limit: 20 },
  );
  const canEdit = auth.session.canUseStudentCapabilities;

  return (
    <StudentWorkspaceShell activePage="work" canCreateWork={canEdit}>
      <WorkspacePage
        description={t('description')}
        eyebrow={t('eyebrow')}
        layout="authoring"
        title={t('title')}
      >
        <section aria-label={t('title')} className="grid gap-6">
          {canEdit ? (
            <Link className={cn(buttonVariants(), 'w-fit')} href="/works/new">
              {t('create')}
            </Link>
          ) : (
            <p className="rounded-surface border border-border bg-muted/60 p-4 text-sm text-muted-foreground">
              {t('readOnly')}
            </p>
          )}
          {page.items.length === 0 ? (
            <p className="rounded-surface border border-dashed border-border bg-card/70 p-10 text-center text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <StudentWorkList
              canEdit={canEdit}
              items={page.items}
              labels={{
                actions: {
                  editDraft: t('actions.editDraft'),
                  editRequested: t('actions.editRequested'),
                  manage: t('actions.manage'),
                  view: t('actions.view'),
                },
                publication: {
                  never_published: t('publication.never_published'),
                  published: t('publication.published'),
                  unpublished: t('publication.unpublished'),
                },
                status: {
                  archived: t('status.archived'),
                  changes_requested: t('status.changes_requested'),
                  draft: t('status.draft'),
                  pending_review: t('status.pending_review'),
                  published: t('status.published'),
                  unpublished: t('status.unpublished'),
                },
                updatedAt: t('updatedAt'),
              }}
            />
          )}
          {page.nextCursor === null ? null : (
            <Link
              className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
              href={`/works?cursor=${encodeURIComponent(page.nextCursor)}`}
            >
              {t('next')}
            </Link>
          )}
        </section>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}
