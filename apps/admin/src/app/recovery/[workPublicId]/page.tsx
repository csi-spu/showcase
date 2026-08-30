import { randomUUID } from 'node:crypto';
import { buttonVariants } from '@showcase/ui/button';
import { ArrowLeftIcon } from 'lucide-react';
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
import { WorkRecoveryPanel } from '../recovery-forms';
import { transitionWorkRecoveryAction } from '../recovery.actions';

export default async function WorkRecoveryPage({
  params,
}: {
  params: Promise<{ workPublicId: string }>;
}) {
  const { workPublicId } = await params;
  const parsed = z.uuid().safeParse(workPublicId);
  if (!parsed.success) notFound();
  const [authState, t] = await Promise.all([getAdminAuthPageState(), getTranslations('Recovery')]);
  if (authState.kind !== 'active') redirect(authState.kind === 'expired' ? '/?expired=1' : '/');
  const token = await readAdminSessionToken();
  if (token === null) redirect('/?expired=1');
  let state;
  try {
    state = await new AdminReviewsCoreClient(getAdminServerEnvironment()).getRecoveryState(
      token,
      parsed.data,
    );
  } catch (error: unknown) {
    if (error instanceof AdminReviewsCoreError && error.code === 'WORK_NOT_FOUND') notFound();
    throw error;
  }
  return (
    <AdminWorkspaceShell activePage="works">
      <AdminWorkspacePage
        actions={
          <Link className={buttonVariants({ variant: 'outline' })} href="/works?view=removals">
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            {t('back')}
          </Link>
        }
        description={
          <span className="break-all text-sm">
            {t('workIdentifier', { value: state.publicId })}
          </span>
        }
        eyebrow={t('detailKicker')}
        layout="detail"
        title={t('heading')}
      >
        <div className="max-w-3xl">
          <WorkRecoveryPanel
            action={transitionWorkRecoveryAction.bind(null, state.publicId)}
            idempotencyKey={randomUUID()}
            state={state}
          />
        </div>
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}
