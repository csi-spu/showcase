'use client';

import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, InboxIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldLabel } from '@/components/ui/field';
import type {
  FieldAnswersReadResult,
  InstructorCollectionField,
  InstructorStudentAnswer,
} from '@/lib/instructor-collection-forms-contract';
import { ENTRANCE_CLASS } from '@/lib/motion';
import { SubmittedFiles } from '../submitted-files';
import { ShowMore, useAnswerPages } from './answer-pages';
import { studentHref, submissionsHref } from './responses-query';

const SELECT_CLASS =
  'h-10 w-full cursor-pointer appearance-none rounded-surface border border-input bg-background px-3 pr-9 text-sm transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

/* Answers to a choice that is no longer one of the options are grouped here. */
const OTHER_GROUP = Symbol('other');

interface AnswerGroup {
  items: InstructorStudentAnswer[];
  option: string | typeof OTHER_GROUP;
}

/**
 * Groups a choice question's rows by option.
 *
 * Core orders the rows by option position with changed options last, so each
 * group is one contiguous run; grouping keeps that order.
 */
export function groupByOption(
  items: InstructorStudentAnswer[],
  options: readonly string[],
): AnswerGroup[] {
  const groups: AnswerGroup[] = [];
  for (const item of items) {
    const option =
      typeof item.value === 'string' && options.includes(item.value) ? item.value : OTHER_GROUP;
    const last = groups.at(-1);
    if (last?.option === option) last.items.push(item);
    else groups.push({ items: [item], option });
  }
  return groups;
}

/**
 * One question at a time, with the Student behind every answer.
 *
 * It is read-only: a decision is recorded on the Student's own page, where the
 * whole submission can be read first.
 */
export function QuestionView({
  fieldId,
  fields,
  formId,
  groupId,
  option,
  result,
}: {
  fieldId: string;
  fields: InstructorCollectionField[];
  formId: string;
  groupId: string;
  option: string | null;
  result: FieldAnswersReadResult;
}) {
  const t = useTranslations('Forms.responses');
  const router = useRouter();
  const selectId = useId();
  const index = fields.findIndex((field) => field.id === fieldId);
  const field = fields[index];
  const previous = fields[index - 1];
  const next = fields[index + 1];
  const hrefFor = (target: InstructorCollectionField) =>
    submissionsHref(groupId, formId, { fieldId: target.id, view: 'question' });

  if (field === undefined) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-surface border border-input bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel htmlFor={selectId}>{t('question.selectLabel')}</FieldLabel>
          <div className="relative">
            <select
              className={SELECT_CLASS}
              id={selectId}
              onChange={(event) => {
                const target = fields.find((candidate) => candidate.id === event.target.value);
                if (target !== undefined) router.push(hrefFor(target));
              }}
              value={field.id}
            >
              {fields.map((candidate, position) => (
                <option key={candidate.id} value={candidate.id}>
                  {`${position + 1}. ${candidate.label}`}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StepLink
            href={previous === undefined ? null : hrefFor(previous)}
            label={t('question.previous')}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </StepLink>
          <span className="min-w-24 text-center text-sm text-muted-foreground tabular-nums">
            {t('question.position', { position: index + 1, total: fields.length })}
          </span>
          <StepLink href={next === undefined ? null : hrefFor(next)} label={t('question.next')}>
            <ChevronRightIcon aria-hidden="true" />
          </StepLink>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t('question.readOnlyNote')}</p>

      {!result.ok || result.page.kind !== 'students' ? (
        <Alert variant="destructive">
          <AlertDescription>{t('loadFailed')}</AlertDescription>
        </Alert>
      ) : (
        <QuestionAnswers
          field={field}
          formId={formId}
          groupId={groupId}
          initial={{ items: result.page.items, nextCursor: result.page.nextCursor }}
          key={field.id}
          option={option}
        />
      )}
    </div>
  );
}

function StepLink({
  children,
  href,
  label,
}: {
  children: ReactNode;
  href: string | null;
  label: string;
}) {
  const className = cn(
    buttonVariants({ size: 'icon', variant: 'outline' }),
    'transition-[scale] active:scale-95 motion-reduce:transition-none',
  );
  if (href === null) {
    return (
      <button aria-label={label} className={className} disabled type="button">
        {children}
      </button>
    );
  }
  return (
    <Link aria-label={label} className={className} href={href}>
      {children}
    </Link>
  );
}

function QuestionAnswers({
  field,
  formId,
  groupId,
  initial,
  option,
}: {
  field: InstructorCollectionField;
  formId: string;
  groupId: string;
  initial: { items: InstructorStudentAnswer[]; nextCursor: string | null };
  option: string | null;
}) {
  const t = useTranslations('Forms.responses');
  const pages = useAnswerPages({
    fieldId: field.id,
    formId,
    initial,
    mode: 'question',
    select: (page) => (page.kind === 'students' ? page.items : null),
  });

  if (pages.items.length === 0) {
    return (
      <EmptyState
        description={t('question.emptyDescription')}
        icon={InboxIcon}
        title={t('question.empty')}
      />
    );
  }

  const isChoice = field.type === 'single_choice' || field.type === 'multiple_choice';

  return (
    <div className={cn('flex flex-col gap-4', ENTRANCE_CLASS)}>
      {isChoice ? (
        groupByOption(pages.items, field.options ?? []).map((group) => (
          <OptionGroup
            formId={formId}
            group={group}
            groupId={groupId}
            isHighlighted={group.option === option}
            // Rows arrive in option order across pages, so each option heads one group.
            key={group.option === OTHER_GROUP ? 'other' : `option-${group.option}`}
          />
        ))
      ) : (
        <AnswerList field={field} formId={formId} groupId={groupId} items={pages.items} />
      )}
      <ShowMore pages={pages} />
    </div>
  );
}

function OptionGroup({
  formId,
  group,
  groupId,
  isHighlighted,
}: {
  formId: string;
  group: AnswerGroup;
  groupId: string;
  isHighlighted: boolean;
}) {
  const t = useTranslations('Forms.responses');
  const ref = useRef<HTMLElement>(null);

  /* An option opened from Summary is brought into view once, where it starts. */
  useEffect(() => {
    if (!isHighlighted) return;
    const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [isHighlighted]);

  const title = group.option === OTHER_GROUP ? t('summary.otherOption') : group.option;

  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-surface border bg-card p-4 transition-[box-shadow] duration-300 motion-reduce:transition-none',
        isHighlighted ? 'border-primary ring-2 ring-primary/30' : 'border-input',
      )}
      data-highlighted={isHighlighted ? 'true' : undefined}
      ref={ref}
    >
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className={group.option === OTHER_GROUP ? 'italic text-muted-foreground' : undefined}>
          {title}
        </span>
        <span className="font-normal text-muted-foreground">
          {t('people', { count: group.items.length })}
        </span>
        {isHighlighted ? <span className="sr-only">{t('question.highlighted')}</span> : null}
      </h3>
      <ul className="flex list-none flex-col divide-y divide-border p-0">
        {group.items.map((item) => (
          <li className="py-2" key={item.studentAccountId}>
            <StudentName formId={formId} groupId={groupId} item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnswerList({
  field,
  formId,
  groupId,
  items,
}: {
  field: InstructorCollectionField;
  formId: string;
  groupId: string;
  items: InstructorStudentAnswer[];
}) {
  const format = useFormatter();
  const text = (value: InstructorStudentAnswer['value']): string => {
    if (value === null) return '';
    if (field.type === 'number' && typeof value === 'number') return format.number(value);
    if (field.type === 'date' && typeof value === 'string') {
      /* A calendar day, formatted in UTC so no timezone moves it. */
      return format.dateTime(new Date(`${value}T00:00:00.000Z`), {
        dateStyle: 'medium',
        timeZone: 'UTC',
      });
    }
    return String(value);
  };

  return (
    <ul className="flex list-none flex-col divide-y divide-border rounded-surface border border-input bg-card p-0">
      {items.map((item) => (
        <li
          className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
          key={item.studentAccountId}
        >
          <div className="sm:w-56 sm:shrink-0">
            <StudentName formId={formId} groupId={groupId} item={item} />
          </div>
          <div className="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap">
            {field.type === 'file_upload' ? (
              <SubmittedFiles files={item.files} />
            ) : (
              text(item.value)
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StudentName({
  formId,
  groupId,
  item,
}: {
  formId: string;
  groupId: string;
  item: InstructorStudentAnswer;
}) {
  const t = useTranslations('Forms.responses');
  const name = `${item.rosterName.firstNameTh} ${item.rosterName.lastNameTh}`;
  return (
    <span className="flex flex-col">
      <Link
        aria-label={t('question.openStudent', { name })}
        className="rounded-control text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={studentHref(groupId, formId, item.studentAccountId, {})}
      >
        {name}
      </Link>
      {item.studentId === null ? null : (
        <span className="text-xs text-muted-foreground tabular-nums">{item.studentId}</span>
      )}
    </span>
  );
}
