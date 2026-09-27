import { ArrowLeftIcon, CalendarClockIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';
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
  const hasRequiredField = obligation.form.fields.some((field) => field.required);

  return (
    <AppShell>
      {/* A single reading column, the width of a paper questionnaire. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <BlurFade offset={8}>
          <header className="overflow-hidden rounded-surface border border-border/80 bg-card shadow-xs">
            <div aria-hidden="true" className="h-2.5 bg-primary" />
            <div className="flex flex-col gap-3 px-5 pt-5 pb-5 sm:px-7 sm:pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="min-w-0 text-2xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
                  {obligation.form.title}
                </h1>
                <StatusBadge tone={statusTone(obligation.status)}>
                  {statusT(obligation.status)}
                </StatusBadge>
              </div>
              {obligation.form.description === null ? null : (
                <p className="max-w-2xl text-sm whitespace-pre-line text-muted-foreground sm:text-base">
                  {obligation.form.description}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-border/70 px-5 py-4 text-sm sm:px-7">
              {/*
               * Who this form is answered as. The name comes from the Roster, so
               * it is shown as a fact of the page rather than an input.
               */}
              <p className="flex items-center gap-2 text-foreground">
                <UserRoundIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="sr-only">{`${t('rosterName')}: `}</span>
                <span className="font-semibold">
                  {`${obligation.rosterName.firstNameTh} ${obligation.rosterName.lastNameTh}`}
                </span>
              </p>
              <p className="ps-6 text-xs text-muted-foreground">{t('rosterNameHint')}</p>
              {deadline === null ? null : (
                <p className="flex items-center gap-2 text-muted-foreground">
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
                  {obligation.hasDeadlinePassed || obligation.isLate
                    ? ` · ${t('deadlineLate')}`
                    : ''}
                </p>
              )}
            </div>
            {hasRequiredField ? (
              <p className="border-t border-border/70 px-5 py-3 text-sm text-destructive sm:px-7">
                {t('requiredLegend')}
              </p>
            ) : null}
          </header>
        </BlurFade>

        <CollectionForm obligation={obligation} prefills={prefills} />

        {/*
         * The way back sits after the form, where a Student who has finished
         * looks next; the logo in the top bar remains the way out from anywhere.
         */}
        <Link
          className="group mx-auto mt-2 inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          href="/"
        >
          <ArrowLeftIcon
            aria-hidden="true"
            className="size-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
          {t('history.backToList')}
        </Link>
      </div>
    </AppShell>
  );
}
