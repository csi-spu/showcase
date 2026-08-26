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
    <AdminWorkspaceShell activePage="reviews">
      <Link className="text-sm font-medium text-primary underline" href="/reviews">
        {t('back')}
      </Link>
      <header className="mt-6 grid max-w-4xl gap-3">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">
          {t('kicker', { number: base.number })}
        </p>
        <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">{t('description')}</p>
      </header>
      <Link
        className="mt-4 inline-block text-sm font-medium text-primary underline"
        href={`/recovery/${base.workPublicId}`}
      >
        จัดการการมองเห็นและการกู้คืนผลงาน
      </Link>
      <div className="mt-8 grid gap-8 xl:grid-cols-12">
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
        <aside className="rounded-surface border border-border bg-card p-6 xl:col-span-5 xl:self-start">
          <h2 className="mb-2 text-xl font-semibold">{t('formHeading')}</h2>
          <p className="mb-6 text-sm leading-6 text-muted-foreground">{t('formHelp')}</p>
          <AdminCorrectionForm
            action={createAdminCorrectionAction.bind(null, base.workPublicId)}
            base={base}
            idempotencyKey={randomUUID()}
          />
        </aside>
      </div>
    </AdminWorkspaceShell>
  );
}
