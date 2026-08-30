import { randomUUID } from 'node:crypto';
import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ArrowLeftIcon, RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminReviewsCoreClient, AdminReviewsCoreError } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminWorkspacePage } from '../../admin-workspace-page';
import { AdminWorkspaceShell } from '../../admin-workspace-shell';
import { RevisionSnapshot } from '../../reviews/revision-snapshot';
import { AdminCorrectionForm } from '../admin-correction-form';
import { createAdminCorrectionAction } from '../correction.actions';

export default async function AdminCorrectionPage({
  params,
}: {
  params: Promise<{ workPublicId: string }>;
}) {
  const { workPublicId: rawWorkPublicId } = await params;
  const parsedWorkPublicId = z.uuid().safeParse(rawWorkPublicId);
  if (!parsedWorkPublicId.success) notFound();
  const [state, t, reviewT] = await Promise.all([
    getAdminAuthPageState(),
    getTranslations('Correction'),
    getTranslations('Review'),
  ]);
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  let base;
  try {
    base = await new AdminReviewsCoreClient(getAdminServerEnvironment()).getCorrectionBase(
      sessionToken,
      parsedWorkPublicId.data,
    );
  } catch (error: unknown) {
    if (error instanceof AdminReviewsCoreError && error.code === 'WORK_NOT_FOUND') notFound();
    throw error;
  }

  return (
    <AdminWorkspaceShell activePage="works">
      <AdminWorkspacePage
        actions={
          <>
            <Link className={buttonVariants({ variant: 'outline' })} href="/works?view=published">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {t('back')}
            </Link>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={`/recovery/${base.workPublicId}`}
            >
              <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              {t('openRecovery')}
            </Link>
          </>
        }
        description={t('description')}
        eyebrow={t('kicker', { number: base.number })}
        layout="detail"
        title={t('title')}
      >
        <div className="grid gap-8 xl:grid-cols-12">
          <RevisionSnapshot
            labels={{
              academicPeriod: reviewT('detail.academicPeriod', {
                semester: base.content.academicPeriod.semester,
                year: base.content.academicPeriod.year,
              }),
              attributions: reviewT('detail.attributions'),
              category: reviewT('detail.category'),
              categoryValue: reviewT(`categories.${base.content.category}`),
              content: t('publishedSnapshot'),
              gallery: reviewT('detail.gallery'),
              links: reviewT('detail.links'),
              media: reviewT('detail.media'),
              poster: reviewT('detail.poster'),
              tags: reviewT('detail.tags'),
              videos: reviewT('detail.videos'),
            }}
            revision={base}
          />
          <aside
            className={cn(
              'rounded-surface border border-border bg-card p-6 shadow-sm xl:sticky xl:top-24 xl:col-span-5 xl:self-start',
            )}
          >
            <h2 className="mb-2 text-xl font-semibold">{t('formHeading')}</h2>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">{t('formHelp')}</p>
            <AdminCorrectionForm
              action={createAdminCorrectionAction.bind(null, base.workPublicId)}
              base={base}
              idempotencyKey={randomUUID()}
            />
          </aside>
        </div>
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}
