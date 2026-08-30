import { randomUUID } from 'node:crypto';
import { Button, buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { resolveRecoveryQueueView } from './recovery-queue-view';

export default async function RecoveryQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ attributionCursor?: string; view?: string; workPublicId?: string }>;
}) {
  const query = await searchParams;
  const view = resolveRecoveryQueueView(query.view);
  const workPublicId = parseAdminWorkReference(query.workPublicId);
  if (query.workPublicId !== undefined) {
    if (workPublicId !== null) redirect(`/recovery/${workPublicId}`);
  }
  const [authState, t] = await Promise.all([getAdminAuthPageState(), getTranslations('Recovery')]);
  if (authState.kind !== 'active') redirect(authState.kind === 'expired' ? '/?expired=1' : '/');
  const token = await readAdminSessionToken();
  if (token === null) redirect('/?expired=1');
  const core = new AdminReviewsCoreClient(getAdminServerEnvironment());
  const queue = view === 'removals' ? await core.listRemovalRequests(token, 20) : null;
  const attributionQueue =
    view === 'attributions'
      ? await core.listAttributionRemovalRequests(token, {
          ...(query.attributionCursor === undefined ? {} : { cursor: query.attributionCursor }),
          limit: 20,
        })
      : null;

  return (
    <AdminWorkspaceShell activePage="recovery">
      <AdminWorkspacePage description={t('description')} eyebrow={t('kicker')} title={t('heading')}>
        <form
          action="/recovery"
          className="grid max-w-3xl gap-5 rounded-surface border border-border bg-card p-6 shadow-sm sm:p-8"
          method="get"
        >
          <input name="view" type="hidden" value={view} />
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

        <nav aria-label={t('queueNavigation')} className="flex flex-wrap gap-2">
          <Link
            aria-current={view === 'removals' ? 'page' : undefined}
            className={buttonVariants({ variant: view === 'removals' ? 'default' : 'outline' })}
            href="/recovery?view=removals"
          >
            {t('queueViews.removals')}
          </Link>
          <Link
            aria-current={view === 'attributions' ? 'page' : undefined}
            className={buttonVariants({ variant: view === 'attributions' ? 'default' : 'outline' })}
            href="/recovery?view=attributions"
          >
            {t('queueViews.attributions')}
          </Link>
        </nav>

        {queue === null ? null : (
          <section className="grid gap-5" aria-labelledby="removal-request-heading">
            <h2 className="text-2xl font-semibold" id="removal-request-heading">
              {t('removalHeading')}
            </h2>
            {queue.items.length === 0 ? (
              <p className="rounded-surface border border-dashed border-border p-8 text-muted-foreground">
                {t('empty')}
              </p>
            ) : (
              <Table aria-label={t('tables.removals')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.work')}</TableHead>
                    <TableHead>{t('columns.reason')}</TableHead>
                    <TableHead>{t('columns.requestedAt')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead className="text-right">{t('columns.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.items.map((request) => (
                    <TableRow key={request.publicId}>
                      <TableCell className="max-w-sm">
                        <h3 className="line-clamp-2 font-semibold">{request.title}</h3>
                        <Link
                          className="mt-2 inline-block text-xs text-primary underline-offset-4 hover:underline"
                          href={`/recovery/${request.workPublicId}`}
                        >
                          {t('openWork')}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-sm whitespace-pre-wrap text-muted-foreground">
                        {request.reason}
                      </TableCell>
                      <TableCell>
                        <time dateTime={request.createdAt}>
                          {formatBangkokDate(request.createdAt)}
                        </time>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t('pending')}</Badge>
                      </TableCell>
                      <TableCell>
                        <RecoveryDecisionForm
                          action={decideRemovalRequestAction.bind(
                            null,
                            request.publicId,
                            request.workPublicId,
                          )}
                          compact
                          idempotencyKey={randomUUID()}
                          request={request}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        )}
        {attributionQueue === null ? null : (
          <section className="grid gap-5" aria-labelledby="attribution-request-heading">
            <h2 className="text-2xl font-semibold" id="attribution-request-heading">
              {t('attribution.heading')}
            </h2>
            {attributionQueue.items.length === 0 ? (
              <p className="rounded-surface border border-dashed border-border p-8 text-muted-foreground">
                {t('attribution.empty')}
              </p>
            ) : (
              <Table aria-label={t('tables.attributions')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.work')}</TableHead>
                    <TableHead>{t('columns.contributor')}</TableHead>
                    <TableHead>{t('columns.reason')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead className="text-right">{t('columns.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attributionQueue.items.map((request) => (
                    <TableRow key={request.publicId}>
                      <TableCell className="max-w-sm">
                        <h3 className="line-clamp-2 font-semibold">{request.workTitle}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatBangkokDate(request.createdAt)}
                        </p>
                      </TableCell>
                      <TableCell>{request.attributionName}</TableCell>
                      <TableCell className="max-w-sm whitespace-pre-wrap text-muted-foreground">
                        {request.reason}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t('pending')}</Badge>
                      </TableCell>
                      <TableCell>
                        <AttributionRemovalDecisionForm
                          action={decideAttributionRemovalRequestAction.bind(
                            null,
                            request.publicId,
                          )}
                          compact
                          idempotencyKey={randomUUID()}
                          request={request}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {attributionQueue.nextCursor === null ? null : (
              <Link
                className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
                href={`/recovery?view=attributions&attributionCursor=${encodeURIComponent(attributionQueue.nextCursor)}`}
              >
                {t('attribution.next')}
              </Link>
            )}
          </section>
        )}
      </AdminWorkspacePage>
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
