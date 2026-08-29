import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminReviewsCoreClient } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminWorkspaceShell } from '../admin-workspace-shell';
import { AttributionRemovalDecisionForm, RecoveryDecisionForm } from './recovery-forms';
import {
  decideAttributionRemovalRequestAction,
  decideRemovalRequestAction,
} from './recovery.actions';

export default async function RecoveryQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ attributionCursor?: string; workPublicId?: string }>;
}) {
  const query = await searchParams;
  if (query.workPublicId !== undefined) {
    const parsed = z.uuid().safeParse(query.workPublicId);
    if (parsed.success) redirect(`/recovery/${parsed.data}`);
  }
  const [authState, t] = await Promise.all([getAdminAuthPageState(), getTranslations('Recovery')]);
  if (authState.kind !== 'active') redirect(authState.kind === 'expired' ? '/?expired=1' : '/');
  const token = await readAdminSessionToken();
  if (token === null) redirect('/?expired=1');
  const core = new AdminReviewsCoreClient(getAdminServerEnvironment());
  const [queue, attributionQueue] = await Promise.all([
    core.listRemovalRequests(token, 20),
    core.listAttributionRemovalRequests(token, {
      ...(query.attributionCursor === undefined ? {} : { cursor: query.attributionCursor }),
      limit: 20,
    }),
  ]);

  return (
    <AdminWorkspaceShell activePage="recovery">
      <header className="grid max-w-4xl gap-3">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">RECOVERY WORKFLOW</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">{t('heading')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>
      <form action="/recovery" className="mt-8 grid max-w-2xl gap-3" method="get">
        <label className="font-medium" htmlFor="recovery-work-public-id">
          Public Work ID
        </label>
        <p className="text-sm text-muted-foreground">{t('lookupHelp')}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="min-h-11 flex-1 rounded-control border border-input bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            id="recovery-work-public-id"
            name="workPublicId"
            required
          />
          <button
            className="min-h-11 rounded-control bg-primary px-5 font-medium text-primary-foreground"
            type="submit"
          >
            {t('lookup')}
          </button>
        </div>
      </form>
      <section className="mt-12 grid gap-5">
        <h2 className="text-2xl font-semibold">Removal Requests</h2>
        {queue.items.length === 0 ? (
          <p className="text-muted-foreground">{t('empty')}</p>
        ) : (
          queue.items.map((request) => (
            <div className="grid gap-3" key={request.publicId}>
              <Link
                className="w-fit text-sm font-medium text-primary underline"
                href={`/recovery/${request.workPublicId}`}
              >
                Public Work ID: {request.workPublicId}
              </Link>
              <RecoveryDecisionForm
                action={decideRemovalRequestAction.bind(
                  null,
                  request.publicId,
                  request.workPublicId,
                )}
                idempotencyKey={randomUUID()}
                request={request}
              />
            </div>
          ))
        )}
      </section>
      <section className="mt-12 grid gap-5">
        <h2 className="text-2xl font-semibold">{t('attribution.heading')}</h2>
        {attributionQueue.items.length === 0 ? (
          <p className="text-muted-foreground">{t('attribution.empty')}</p>
        ) : (
          attributionQueue.items.map((request) => (
            <AttributionRemovalDecisionForm
              action={decideAttributionRemovalRequestAction.bind(null, request.publicId)}
              idempotencyKey={randomUUID()}
              key={request.publicId}
              request={request}
            />
          ))
        )}
        {attributionQueue.nextCursor === null ? null : (
          <Link
            className="w-fit font-medium text-primary underline"
            href={`/recovery?attributionCursor=${encodeURIComponent(attributionQueue.nextCursor)}`}
          >
            {t('attribution.next')}
          </Link>
        )}
      </section>
    </AdminWorkspaceShell>
  );
}
