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
    <AdminWorkspaceShell activePage="recovery">
      <Link className="text-sm font-medium text-primary underline" href="/recovery">
        {t('navigation')}
      </Link>
      <header className="mt-6 grid max-w-4xl gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">{t('heading')}</h1>
        <p className="break-all text-sm text-muted-foreground">Public Work ID: {state.publicId}</p>
      </header>
      <div className="mt-8 max-w-3xl">
        <WorkRecoveryPanel
          action={transitionWorkRecoveryAction.bind(null, state.publicId)}
          idempotencyKey={randomUUID()}
          state={state}
        />
      </div>
    </AdminWorkspaceShell>
  );
}
