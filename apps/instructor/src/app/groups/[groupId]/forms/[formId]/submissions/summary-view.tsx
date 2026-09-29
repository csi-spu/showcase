'use client';

import { cn } from '@showcase/ui/cn';
import { InboxIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { DonutChart, type DonutSegment } from '@/components/ui/donut-chart';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import type {
  InstructorCollectionField,
  InstructorFieldSummary,
  InstructorResponseSummary,
} from '@/lib/instructor-collection-forms-contract';
import { ENTRANCE_CLASS, staggerDelay } from '@/lib/motion';
import { ShowMore, useAnswerPages } from './answer-pages';
import { BarList, type Bar } from './bar-list';
import { submissionsHref } from './responses-query';

type Summary<Type extends InstructorFieldSummary['type']> = Extract<
  InstructorFieldSummary,
  { type: Type }
>;

const CARD_CLASS = 'flex flex-col gap-4 rounded-surface border border-input bg-card p-4 sm:p-5';

/*
 * A date answer is a calendar day with no time of its own. It is read at UTC
 * midnight and formatted in UTC, so no timezone can move it to another day.
 */
function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * The anonymous overview of every Student's latest submission.
 *
 * Nothing here names a Student: the totals link to the Individual list, and a
 * choice links to the Question view, where names are shown.
 */
export function SummaryView({
  formId,
  groupId,
  summary,
}: {
  formId: string;
  groupId: string;
  summary: InstructorResponseSummary;
}) {
  const t = useTranslations('Forms');
  const { totals } = summary;
  const submitted = totals.awaitingChecking + totals.changesRequired + totals.passed;
  const summaries = new Map(summary.fields.map((field) => [field.fieldId, field]));
  const statusHref = (
    status: 'awaiting_checking' | 'changes_required' | 'not_submitted' | 'passed',
  ) => submissionsHref(groupId, formId, { status, view: 'individual' });
  const segments: DonutSegment[] = [
    {
      href: statusHref('awaiting_checking'),
      label: t('obligationStatus.awaiting_checking'),
      tone: 'information',
      value: totals.awaitingChecking,
    },
    {
      href: statusHref('changes_required'),
      label: t('obligationStatus.changes_required'),
      tone: 'warning',
      value: totals.changesRequired,
    },
    {
      href: statusHref('passed'),
      label: t('obligationStatus.passed'),
      tone: 'success',
      value: totals.passed,
    },
    {
      href: statusHref('not_submitted'),
      label: t('obligationStatus.not_submitted'),
      tone: 'muted',
      value: totals.notSubmitted,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className={cn(CARD_CLASS, ENTRANCE_CLASS)}>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{t('responses.summary.totalsTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('responses.summary.submittedOf', { assigned: totals.assigned, submitted })}
          </p>
        </div>
        <DonutChart
          centerLabel={t('responses.summary.totalsCenter')}
          segments={segments}
          title={t('responses.summary.totalsTitle')}
          total={totals.assigned}
        />
      </section>

      <p className="text-sm text-muted-foreground">{t('responses.summary.anonymousNote')}</p>

      {submitted === 0 ? (
        <EmptyState
          description={t('responses.summary.emptyDescription')}
          icon={InboxIcon}
          title={t('responses.summary.empty')}
        />
      ) : (
        <ol className="flex list-none flex-col gap-4 p-0">
          {summary.form.fields.map((field, index) => {
            const fieldSummary = summaries.get(field.id);
            if (fieldSummary === undefined) return null;
            return (
              <li className={ENTRANCE_CLASS} key={field.id} style={staggerDelay(index, 120)}>
                <FieldSummaryCard
                  field={field}
                  formId={formId}
                  groupId={groupId}
                  summary={fieldSummary}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function FieldSummaryCard({
  field,
  formId,
  groupId,
  summary,
}: {
  field: InstructorCollectionField;
  formId: string;
  groupId: string;
  summary: InstructorFieldSummary;
}) {
  const t = useTranslations('Forms');

  return (
    <section aria-labelledby={`summary-${field.id}`} className={CARD_CLASS}>
      <header className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold" id={`summary-${field.id}`}>
          {field.label}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge tone="muted">{t(`fieldType.${field.type}`)}</StatusBadge>
          {summary.type === 'multiple_choice' ? (
            <StatusBadge tone="information">{t('responses.summary.multipleAllowed')}</StatusBadge>
          ) : null}
          <span>{t('responses.summary.answeredBy', { count: summary.answeredCount })}</span>
        </div>
      </header>

      {summary.answeredCount === 0 ? (
        <p className="text-sm text-muted-foreground">{t('responses.summary.noAnswers')}</p>
      ) : (
        <FieldSummaryBody field={field} formId={formId} groupId={groupId} summary={summary} />
      )}
    </section>
  );
}

function FieldSummaryBody({
  field,
  formId,
  groupId,
  summary,
}: {
  field: InstructorCollectionField;
  formId: string;
  groupId: string;
  summary: InstructorFieldSummary;
}) {
  switch (summary.type) {
    case 'single_choice':
    case 'multiple_choice':
      return <ChoiceSummary field={field} formId={formId} groupId={groupId} summary={summary} />;
    case 'number':
      return <NumberSummary field={field} summary={summary} />;
    case 'date':
      return <DateSummary field={field} summary={summary} />;
    case 'short_text':
      return <ShortTextSummary formId={formId} summary={summary} />;
    case 'long_text':
      return <LongTextSummary formId={formId} summary={summary} />;
    case 'file_upload':
      return <FileSummary summary={summary} />;
  }
}

/*
 * Options keep the order the Instructor gave them. A percentage is of the
 * Students who answered, so a multiple-choice question can add up past 100%.
 */
function ChoiceSummary({
  field,
  formId,
  groupId,
  summary,
}: {
  field: InstructorCollectionField;
  formId: string;
  groupId: string;
  summary: Summary<'multiple_choice'> | Summary<'single_choice'>;
}) {
  const t = useTranslations('Forms.responses');
  const format = useFormatter();
  const percent = (count: number) =>
    format.number(count / summary.answeredCount, { maximumFractionDigits: 0, style: 'percent' });
  const bar = (id: string, label: string, count: number, option?: string): Bar => {
    const values = { count, option: label, percent: percent(count) };
    return {
      ariaLabel: t('summary.optionBarLabel', values),
      count,
      href: submissionsHref(groupId, formId, { fieldId: field.id, option, view: 'question' }),
      id,
      isMuted: option === undefined,
      label,
      tooltip: t('summary.optionBar', values),
      value: `${count} · ${percent(count)}`,
    };
  };
  const bars = summary.options.map((option) =>
    bar(`option-${option.value}`, option.value, option.count, option.value),
  );
  if (summary.otherCount > 0) {
    bars.push(bar('other', t('summary.otherOption'), summary.otherCount));
  }

  return <BarList bars={bars} denominator={summary.answeredCount} label={field.label} />;
}

function NumberSummary({
  field,
  summary,
}: {
  field: InstructorCollectionField;
  summary: Summary<'number'>;
}) {
  const t = useTranslations('Forms.responses');
  const format = useFormatter();
  const number = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const maxCount = Math.max(0, ...summary.histogram.map((bin) => bin.count));
  const bars: Bar[] = summary.histogram.map((bin) => {
    const count = bin.count;
    const label =
      bin.from === bin.to ? number(bin.from) : `${number(bin.from)} – ${number(bin.to)}`;
    return {
      count,
      id: `${bin.from}-${bin.to}`,
      label,
      tooltip:
        bin.from === bin.to
          ? t('summary.valueBar', { count, value: label })
          : t('summary.rangeBar', { count, from: number(bin.from), to: number(bin.to) }),
      value: t('people', { count }),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {summary.stats === null ? null : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ['count', number(summary.answeredCount)],
              ['min', number(summary.stats.min)],
              ['median', number(summary.stats.median)],
              ['mean', number(summary.stats.mean)],
              ['max', number(summary.stats.max)],
            ] as const
          ).map(([key, value]) => (
            <div className="flex flex-col gap-0.5 rounded-control bg-muted/60 px-3 py-2" key={key}>
              <dt className="text-xs text-muted-foreground">{t(`summary.stats.${key}`)}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('summary.histogramTitle')}</h4>
        <BarList
          bars={bars}
          denominator={maxCount}
          label={`${field.label} ${t('summary.histogramTitle')}`}
        />
      </div>
    </div>
  );
}

function DateSummary({
  field,
  summary,
}: {
  field: InstructorCollectionField;
  summary: Summary<'date'>;
}) {
  const t = useTranslations('Forms.responses');
  const format = useFormatter();
  const day = (value: string) =>
    format.dateTime(calendarDate(value), { dateStyle: 'medium', timeZone: 'UTC' });
  const maxCount = Math.max(0, ...summary.months.map((month) => month.count));
  const bars: Bar[] = summary.months.map((month) => {
    const label = format.dateTime(calendarDate(`${month.month}-01`), {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    });
    return {
      count: month.count,
      id: month.month,
      label,
      tooltip: t('summary.valueBar', { count: month.count, value: label }),
      value: t('people', { count: month.count }),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {summary.earliest === null || summary.latest === null ? null : (
        <p className="text-sm">
          {t('summary.dateRange', {
            earliest: day(summary.earliest),
            latest: day(summary.latest),
          })}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('summary.monthsTitle')}</h4>
        <BarList
          bars={bars}
          denominator={maxCount}
          label={`${field.label} ${t('summary.monthsTitle')}`}
        />
      </div>
    </div>
  );
}

/* Short answers are grouped by their normalized text, most common first. */
function ShortTextSummary({ formId, summary }: { formId: string; summary: Summary<'short_text'> }) {
  const t = useTranslations('Forms.responses');
  const pages = useAnswerPages({
    fieldId: summary.fieldId,
    formId,
    initial: summary.groups,
    mode: 'summary',
    select: (page) => (page.kind === 'groups' ? page.items : null),
  });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex list-none flex-col divide-y divide-border p-0">
        {pages.items.map((group, index) => (
          <li
            className="flex items-baseline justify-between gap-3 py-2 text-sm"
            // Values are unique per group, but a later page may repeat one after an edit.
            key={`${index}-${group.value}`}
          >
            <span className="min-w-0 break-words whitespace-pre-wrap">{group.value}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {t('people', { count: group.count })}
            </span>
          </li>
        ))}
      </ul>
      <ShowMore pages={pages} />
    </div>
  );
}

function LongTextSummary({ formId, summary }: { formId: string; summary: Summary<'long_text'> }) {
  const pages = useAnswerPages({
    fieldId: summary.fieldId,
    formId,
    initial: summary.answers,
    mode: 'summary',
    select: (page) => (page.kind === 'texts' ? page.items : null),
  });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex list-none flex-col gap-2 p-0">
        {pages.items.map((answer, index) => (
          <li
            className="rounded-control bg-muted/60 px-3 py-2 text-sm break-words whitespace-pre-wrap"
            // Anonymous values carry no id, and two Students may write the same text.
            key={index}
          >
            {answer.value}
          </li>
        ))}
      </ul>
      <ShowMore pages={pages} />
    </div>
  );
}

function FileSummary({ summary }: { summary: Summary<'file_upload'> }) {
  const t = useTranslations('Forms.responses');
  const format = useFormatter();
  const figures = [
    ['fileStudents', summary.answeredCount],
    ['fileTotal', summary.fileCount],
    ['fileNotReady', summary.notReadyCount],
  ] as const;

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {figures.map(([key, value]) => (
        <div className="flex flex-col gap-0.5 rounded-control bg-muted/60 px-3 py-2" key={key}>
          <dt className="text-xs text-muted-foreground">{t(`summary.${key}`)}</dt>
          <dd className="text-lg font-semibold tabular-nums">{format.number(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
