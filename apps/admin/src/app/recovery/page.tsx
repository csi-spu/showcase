import { randomUUID } from 'node:crypto';
import { Button, buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminReviewsCoreClient } from '@/lib/admin-reviews-core';
import { parseAdminWorkReference } from '@/lib/admin-work-reference';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminWorkspacePage } from '../admin-workspace-page';
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
  const workPublicId = parseAdminWorkReference(query.workPublicId);
  if (query.workPublicId !== undefined) {
    if (workPublicId !== null) redirect(`/recovery/${workPublicId}`);
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
      <AdminWorkspacePage description={t('description')} eyebrow={t('kicker')} title={t('heading')}>
        <form
          action="/recovery"
          className="grid max-w-3xl gap-5 rounded-surface border border-border bg-card p-6 shadow-sm sm:p-8"
          method="get"
        >
          <Field>
            <FieldLabel htmlFor="recovery-work-public-id">{t('workReference')}</FieldLabel>
            <Input
              aria-invalid={query.workPublicId !== undefined && workPublicId === null}
              defaultValue={query.workPublicId ?? ''}
              id="recovery-work-public-id"
              name="workPublicId"
              placeholder={t('workReferencePlaceholder')}
              required
            />
            <FieldDescription>{t('lookupHelp')}</FieldDescription>
          </Field>
          {query.workPublicId !== undefined && workPublicId === null ? (
            <p className="text-sm text-destructive" role="alert">
              {t('lookupInvalid')}
            </p>
          ) : null}
          <Button className="w-full sm:w-fit" type="submit">
            {t('lookup')}
          </Button>
        </form>

        <div className="grid items-start gap-8 2xl:grid-cols-2">
          <section className="grid gap-5" aria-labelledby="removal-request-heading">
            <h2 className="text-2xl font-semibold" id="removal-request-heading">
              {t('removalHeading')}
            </h2>
            {queue.items.length === 0 ? (
              <p className="rounded-surface border border-dashed border-border p-8 text-muted-foreground">
                {t('empty')}
              </p>
            ) : (
              queue.items.map((request) => (
                <div className="grid gap-3" key={request.publicId}>
                  <Link
                    className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'w-fit')}
                    href={`/recovery/${request.workPublicId}`}
                  >
                    {t('openWork')}
                  </Link>
                  <p className="break-all text-xs text-muted-foreground">
                    {t('workIdentifier', { value: request.workPublicId })}
                  </p>
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
          <section className="grid gap-5" aria-labelledby="attribution-request-heading">
            <h2 className="text-2xl font-semibold" id="attribution-request-heading">
              {t('attribution.heading')}
            </h2>
            {attributionQueue.items.length === 0 ? (
              <p className="rounded-surface border border-dashed border-border p-8 text-muted-foreground">
                {t('attribution.empty')}
              </p>
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
                className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
                href={`/recovery?attributionCursor=${encodeURIComponent(attributionQueue.nextCursor)}`}
              >
                {t('attribution.next')}
              </Link>
            )}
          </section>
        </div>
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}
