import { ArrowLeftIcon, CheckCircle2Icon, ClockIcon, PencilLineIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@showcase/ui/button';
import { CoreClientError } from '@showcase/core-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import type {
  InstructorCollectionField,
  InstructorCollectionFile,
} from '@/lib/instructor-collection-forms-contract';
import { AppShell } from '@/app/app-shell';

interface HistoryPageProps {
  params: Promise<{ formId: string; groupId: string; studentAccountId: string }>;
}

/** Dates are stored in UTC and read in the timezone the reader lives in. */
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', DATE_FORMAT).format(new Date(value));
}

/**
 * Every retained version of one Student's response.
 *
 * Each version shows the answers exactly as they were sent, so a decision can
 * always be read against the work it was actually made about rather than
 * against a later correction.
 */
export default async function StudentHistoryPage({ params }: HistoryPageProps) {
  const { formId, groupId, studentAccountId } = await params;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms');
  const groupsT = await getTranslations('Groups');
  const environment = getInstructorServerEnvironment();

  let detail;
  let history;
  try {
    [detail, history] = await Promise.all([
      new InstructorCollectionGroupsCoreClient(environment).getGroup(sessionToken, groupId),
      new InstructorCollectionFormsCoreClient(environment).listHistory(
        sessionToken,
        formId,
        studentAccountId,
      ),
    ]);
  } catch (error: unknown) {
    /*
     * Core answers the same way for a form that does not exist and one this
     * Student was never assigned, so this page cannot distinguish them either.
     */
    if (
      error instanceof CoreClientError &&
      ['FORM_NOT_FOUND', 'GROUP_NOT_FOUND', 'OBLIGATION_NOT_FOUND'].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <AppShell
      trail={[
        { href: '/rounds', label: groupsT('round.pageTitle') },
        { href: `/groups/${groupId}`, label: detail.group.name },
        { href: `/groups/${groupId}/forms/${formId}`, label: history.form.title },
        { href: `/groups/${groupId}/forms/${formId}/submissions`, label: t('review.pageTitle') },
        { label: t('history.pageTitle') },
      ]}
      roundId={detail.group.roundId}
    >
      <PageHeader
        action={
          <Link
            className={buttonVariants({ variant: 'outline' })}
            href={`/groups/${groupId}/forms/${formId}/submissions`}
          >
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            {t('history.backToReview')}
          </Link>
        }
        description={t('history.pageDescription')}
        title={history.form.title}
      />

      {history.entries.length === 0 ? (
        <EmptyState
          description={t('history.emptyDescription')}
          icon={ClockIcon}
          title={t('history.empty')}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {history.firstSubmittedAt === null ? null : (
            <Alert variant={history.isLate ? 'warning' : 'information'}>
              <AlertDescription>
                {t('history.firstSubmittedAt', { date: formatDate(history.firstSubmittedAt) })}
                {' · '}
                {history.isLate ? t('history.late') : t('history.onTime')}
              </AlertDescription>
            </Alert>
          )}

          <ol className="flex list-none flex-col gap-4 p-0">
            {history.entries.map((entry, index) => (
              <li
                className="flex flex-col gap-3 rounded-surface border border-input bg-card p-4"
                key={entry.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">
                    {t('history.versionHeading', { version: entry.version })}
                  </h2>
                  {/* Entries arrive newest first, so the first one is the current version. */}
                  {index === 0 ? (
                    <StatusBadge tone="information">{t('history.currentVersion')}</StatusBadge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('history.submittedAt', { date: formatDate(entry.submittedAt) })}
                </p>

                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t('review.answersHeading')}</h3>
                  <dl className="flex flex-col gap-2">
                    {entry.fields.map((field) => (
                      <div className="flex flex-col gap-0.5" key={field.id}>
                        <dt className="text-sm font-medium">{field.label}</dt>
                        <dd className="text-sm text-muted-foreground">
                          <AnswerValue
                            emptyLabel={t('review.noAnswer')}
                            field={field}
                            files={entry.files[field.id] ?? []}
                            value={entry.answers[field.id]}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t('history.checkingHeading')}</h3>
                  {entry.checkingEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('history.notCheckedYet')}</p>
                  ) : (
                    <ul className="flex list-none flex-col gap-2 p-0">
                      {entry.checkingEvents.map((event) => (
                        <li
                          className="flex flex-col gap-1"
                          key={`${event.occurredAt}-${event.decision}`}
                        >
                          <StatusBadge
                            icon={event.decision === 'passed' ? CheckCircle2Icon : PencilLineIcon}
                            tone={event.decision === 'passed' ? 'success' : 'warning'}
                          >
                            {event.decision === 'passed'
                              ? t('history.decisionPassed')
                              : t('history.decisionChangesRequired')}
                          </StatusBadge>
                          <p className="text-sm text-muted-foreground">
                            {t('history.decisionBy', {
                              date: formatDate(event.occurredAt),
                              name: event.instructorName,
                            })}
                          </p>
                          {event.reason === null ? null : (
                            <p className="text-sm text-foreground">{event.reason}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </li>
            ))}
          </ol>
        </div>
      )}
    </AppShell>
  );
}

function AnswerValue({
  emptyLabel,
  field,
  files,
  value,
}: {
  emptyLabel: string;
  field: InstructorCollectionField;
  files: InstructorCollectionFile[];
  value: unknown;
}) {
  if (field.type === 'file_upload') {
    if (files.length === 0) return <>{emptyLabel}</>;
    return (
      <ul className="flex list-none flex-col gap-1 p-0">
        {files.map((file) => (
          <li className="truncate" key={file.id}>
            {file.originalFilename}
          </li>
        ))}
      </ul>
    );
  }
  return <>{formatAnswer(value, emptyLabel)}</>;
}

/** Renders any answer shape the field types can produce as readable text. */
function formatAnswer(value: unknown, emptyLabel: string): string {
  if (value === null || value === undefined || value === '') return emptyLabel;
  if (Array.isArray(value)) {
    return value.length === 0 ? emptyLabel : value.map(String).join(', ');
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }
  return emptyLabel;
}
