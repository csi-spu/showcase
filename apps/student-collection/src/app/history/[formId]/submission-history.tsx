import { CheckCircle2Icon, ClockIcon, PencilLineIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import type {
  StudentCollectionField,
  StudentCollectionFile,
  StudentCollectionSubmissionHistory,
} from '@/lib/student-collection-forms-contract';

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
 * Every retained version of one response.
 *
 * Each version shows the answers exactly as they were sent, not as they read
 * after a later correction, so a decision can always be understood against the
 * work it was actually made about.
 */
export async function SubmissionHistory({
  history,
}: {
  history: StudentCollectionSubmissionHistory;
}) {
  const t = await getTranslations('Forms.history');

  if (history.entries.length === 0) {
    return <EmptyState description={t('emptyDescription')} icon={ClockIcon} title={t('empty')} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {history.firstSubmittedAt === null ? null : (
        <Alert variant={history.isLate ? 'warning' : 'information'}>
          <AlertDescription>
            {t('firstSubmittedAt', { date: formatDate(history.firstSubmittedAt) })}
            {' · '}
            {history.isLate ? t('late') : t('onTime')}
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
                {t('versionHeading', { version: entry.version })}
              </h2>
              {/* Entries arrive newest first, so the first one is the current version. */}
              {index === 0 ? (
                <StatusBadge tone="information">{t('currentVersion')}</StatusBadge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('submittedAt', { date: formatDate(entry.submittedAt) })}
            </p>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t('answersHeading')}</h3>
              <dl className="flex flex-col gap-2">
                {entry.fields.map((field) => (
                  <div className="flex flex-col gap-0.5" key={field.id}>
                    <dt className="text-sm font-medium">{field.label}</dt>
                    <dd className="text-sm text-muted-foreground">
                      <AnswerValue
                        emptyLabel={t('noAnswer')}
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
              <h3 className="text-sm font-semibold">{t('checkingHeading')}</h3>
              {entry.checkingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('notCheckedYet')}</p>
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
                          ? t('decisionPassed')
                          : t('decisionChangesRequired')}
                      </StatusBadge>
                      <p className="text-sm text-muted-foreground">
                        {t('decisionBy', {
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
  );
}

function AnswerValue({
  emptyLabel,
  field,
  files,
  value,
}: {
  emptyLabel: string;
  field: StudentCollectionField;
  files: StudentCollectionFile[];
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
