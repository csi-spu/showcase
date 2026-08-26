import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminReviewsCoreClient, AdminReviewsCoreError } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminWorkspaceShell } from '../../admin-workspace-shell';
import { ChangeRequestForm } from '../change-request-form';
import { ApprovePublicationForm } from '../approve-publication-form';
import { approveAndPublishAction, requestChangesAction } from '../review.actions';
import { RevisionSnapshot } from '../revision-snapshot';

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ revisionPublicId: string }>;
}) {
  const { revisionPublicId: rawRevisionPublicId } = await params;
  const parsedRevisionPublicId = z.uuid().safeParse(rawRevisionPublicId);
  if (!parsedRevisionPublicId.success) notFound();
  const [state, t] = await Promise.all([getAdminAuthPageState(), getTranslations('Review')]);
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  let revision;
  try {
    revision = await new AdminReviewsCoreClient(getAdminServerEnvironment()).getRevision(
      sessionToken,
      parsedRevisionPublicId.data,
    );
  } catch (error: unknown) {
    if (error instanceof AdminReviewsCoreError && error.code === 'WORK_REVISION_NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  return (
    <AdminWorkspaceShell activePage="reviews">
      <Link className="text-sm font-medium text-primary underline" href="/reviews">
        {t('detail.back')}
      </Link>
      <header className="mt-6 grid max-w-4xl gap-3">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">
          REVISION {revision.number}
        </p>
        <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
          {revision.content.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('detail.submittedAt', { value: formatBangkokDate(revision.submittedAt) })}
        </p>
      </header>
      <div className="mt-8 grid gap-8 xl:grid-cols-12">
        <RevisionSnapshot
          labels={{
            academicPeriod: t('detail.academicPeriod', {
              semester: revision.content.academicPeriod.semester,
              year: revision.content.academicPeriod.year,
            }),
            attributions: t('detail.attributions'),
            category: t('detail.category'),
            categoryValue: t(`categories.${revision.content.category}`),
            content: t('detail.content'),
            gallery: t('detail.gallery'),
            links: t('detail.links'),
            media: t('detail.media'),
            poster: t('detail.poster'),
            tags: t('detail.tags'),
            videos: t('detail.videos'),
          }}
          revision={revision}
        />
        <aside className="grid gap-6 xl:col-span-5 xl:self-start">
          <section className="rounded-surface border border-primary/30 bg-primary-soft p-6">
            <h2 className="mb-5 text-xl font-semibold">{t('approval.heading')}</h2>
            <ApprovePublicationForm
              action={approveAndPublishAction.bind(null, revision.publicId)}
              expectedRevisionVersion={revision.version}
              idempotencyKey={randomUUID()}
            />
          </section>
          <section className="rounded-surface border border-border bg-card p-6">
            <h2 className="mb-5 text-xl font-semibold">{t('form.heading')}</h2>
            <ChangeRequestForm
              action={requestChangesAction.bind(null, revision.publicId)}
              expectedRevisionVersion={revision.version}
              idempotencyKey={randomUUID()}
            />
          </section>
        </aside>
      </div>
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
