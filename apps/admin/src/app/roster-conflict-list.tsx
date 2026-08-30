import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { CheckCircle2Icon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { randomUUID } from 'node:crypto';
import type { AdminRosterConflictPage } from '@/lib/admin-roster-core';
import type { RosterConflictAction } from './roster-conflict-state';
import { RosterConflictResolutionForm } from './roster-conflict-resolution-form';

export async function RosterConflictList({
  action,
  batchId,
  page,
}: {
  action: RosterConflictAction;
  batchId: string;
  page: AdminRosterConflictPage;
}) {
  const t = await getTranslations('Roster.conflicts');
  if (page.conflicts.length === 0) return null;
  return (
    <section aria-labelledby="roster-conflicts-title" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold" id="roster-conflicts-title">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>
      <ol className="flex flex-col gap-4">
        {page.conflicts.map((conflict) => (
          <li
            className="rounded-card border border-border bg-card p-4 sm:p-6"
            key={conflict.conflictId}
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">{t('row', { value: conflict.rowNumber })}</p>
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
                  conflict.status === 'pending'
                    ? 'bg-warning-background text-warning'
                    : 'bg-success-background text-success',
                )}
              >
                {conflict.status === 'pending' ? (
                  <TriangleAlertIcon aria-hidden="true" className="size-4" />
                ) : (
                  <CheckCircle2Icon aria-hidden="true" className="size-4" />
                )}
                {t(`status.${conflict.status}`)}
              </span>
            </div>
            <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-2">
              <NameComparison
                firstName={conflict.existingFirstNameTh}
                label={t('existingName')}
                lastName={conflict.existingLastNameTh}
              />
              <NameComparison
                firstName={conflict.incomingFirstNameTh}
                label={t('incomingName')}
                lastName={conflict.incomingLastNameTh}
              />
            </dl>
            {conflict.status === 'pending' ? (
              <RosterConflictResolutionForm
                action={action}
                batchId={batchId}
                conflictId={conflict.conflictId}
                expectedVersion={conflict.version}
                idempotencyKey={randomUUID()}
              />
            ) : (
              <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('resolvedAs')}</dt>
                  <dd className="font-medium">{t(`resolution.${conflict.resolution!}`)}</dd>
                </div>
                {conflict.reason ? (
                  <div>
                    <dt className="text-muted-foreground">{t('recordedReason')}</dt>
                    <dd>{conflict.reason}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </li>
        ))}
      </ol>
      {page.nextAfterRowNumber === null ? null : (
        <Link
          className={cn(buttonVariants({ variant: 'outline' }), 'self-start')}
          href={`/roster?batchId=${batchId}&conflictAfter=${page.nextAfterRowNumber}`}
        >
          {t('nextPage')}
        </Link>
      )}
    </section>
  );
}

function NameComparison({
  firstName,
  label,
  lastName,
}: {
  firstName: string;
  label: string;
  lastName: string;
}) {
  return (
    <div className="bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-medium">{`${firstName} ${lastName}`}</dd>
    </div>
  );
}
