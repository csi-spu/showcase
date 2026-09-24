import { ArrowLeftIcon, CalendarClockIcon, FileTextIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { StatusBadge } from '@/components/ui/status-badge';
import { getStudentCollectionAuthPageState } from '@/lib/student-collection-auth-page-state';
import { readStudentCollectionSessionToken } from '@/lib/student-collection-auth-session';
import { StudentCollectionFormsCoreClient } from '@/lib/student-collection-forms-core';
import type { StudentCollectionObligation } from '@/lib/student-collection-forms-core';
import { getStudentCollectionServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../../app-shell';
import { CollectionForm } from '../../collection-form';

function statusTone(status: StudentCollectionObligation['status']) {
  switch (status) {
    case 'awaiting_checking':
      return 'information' as const;
    case 'changes_required':
      return 'warning' as const;
    case 'passed':
      return 'success' as const;
    default:
      return 'muted' as const;
  }
}

interface FormPageProps {
  params: Promise<{ formId: string }>;
}

export default async function FormPage({ params }: FormPageProps) {
  const { formId } = await params;
  /*
   * A signed-out visit to a deeplink still lands here first, since the page
   * needs a session to fetch anything from Core. The return path is carried
   * on the redirect so "/" can send the Student straight back after login,
   * instead of stranding them on the dashboard.
   */
  const returnTo = `/forms/${formId}`;
  const state = await getStudentCollectionAuthPageState(false);
  if (state.kind !== 'active') {
    redirect(
      state.kind === 'expired'
        ? `/?expired=1&returnTo=${encodeURIComponent(returnTo)}`
        : `/?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }
  const sessionToken = await readStudentCollectionSessionToken();
  if (sessionToken === null) {
    redirect(`/?expired=1&returnTo=${encodeURIComponent(returnTo)}`);
  }

  const [t, statusT] = await Promise.all([
    getTranslations('Forms'),
    getTranslations('Forms.status'),
  ]);

  /*
   * There is no single-obligation endpoint: Core scopes `list` to the caller,
   * so finding nothing here means this Student has no obligation on this
   * form -- the same 404 a lookup by id would give, without a second
   * authorization path to keep in sync with Core's.
   */
  const client = new StudentCollectionFormsCoreClient(getStudentCollectionServerEnvironment());
  const obligations = await client.list(sessionToken);
  const obligation = obligations.find((entry) => entry.form.id === formId);
  if (obligation === undefined) notFound();

  /*
   * Prefills are scoped per form and only meaningful while the Student can
   * still answer it -- a submitted form shows what was sent, never a fresh
   * suggestion, matching the dashboard's own rule for the same predicate.
   */
  const isAnswerable =
    obligation.status === 'not_submitted' || obligation.status === 'changes_required';
  const prefills = isAnswerable ? await client.listPrefills(sessionToken, formId) : [];

  const deadline = obligation.form.deadlineAt;

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <Link
          className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), '-ml-2 w-fit')}
          href="/"
        >
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t('history.backToList')}
        </Link>

        <div className="flex flex-col gap-3 rounded-surface border border-border/80 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-accent-foreground">
                <FileTextIcon aria-hidden="true" className="size-3.5" />
                {t('formEyebrow')}
              </span>
              <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-2xl">
                {obligation.form.title}
              </h1>
              {obligation.form.description === null ? null : (
                <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                  {obligation.form.description}
                </p>
              )}
            </div>
            <StatusBadge tone={statusTone(obligation.status)}>
              {statusT(obligation.status)}
            </StatusBadge>
          </div>
          {deadline === null ? null : (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClockIcon aria-hidden="true" className="size-4 shrink-0" />
              {t('deadline', {
                date: new Intl.DateTimeFormat('th-TH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Bangkok',
                }).format(new Date(deadline)),
              })}
              {/*
               * Shown while the deadline is past and nothing has been sent, and
               * kept afterwards when the first submission was itself late.
               */}
              {obligation.hasDeadlinePassed || obligation.isLate ? ` · ${t('deadlineLate')}` : ''}
            </p>
          )}
        </div>
      </div>
      <CollectionForm obligation={obligation} prefills={prefills} />
    </AppShell>
  );
}
