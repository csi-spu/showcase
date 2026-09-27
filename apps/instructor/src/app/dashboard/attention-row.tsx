import { cn } from '@showcase/ui/cn';
import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import type { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/ui/status-badge';
import type { InstructorStudentAttentionRow } from '@/lib/instructor-collection-overview-core';

type DashboardTranslator = Awaited<ReturnType<typeof getTranslations<'Dashboard'>>>;

const STATUS_TONES = {
  awaiting_checking: 'information',
  changes_required: 'warning',
  not_submitted: 'muted',
} as const;

export const ATTENTION_ACCENT_CLASSES = {
  awaiting_checking: 'before:bg-information',
  changes_required: 'before:bg-warning',
  not_submitted: 'before:bg-muted-foreground/40',
} as const;

export function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

/*
 * One Student's outstanding form, shared by the dashboard preview and the
 * follow-up page. It links to the form's submission queue, which is where the
 * row is acted on: the question it raises is "has this arrived", and that
 * page answers it. An overdue row carries the destructive accent instead of
 * its status colour.
 */
export function AttentionRow({
  row,
  t,
}: {
  row: InstructorStudentAttentionRow;
  t: DashboardTranslator;
}) {
  return (
    <Link
      className={cn(
        "group relative flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-surface border border-border/80 bg-card py-3 pr-3.5 pl-5 outline-none transition-[translate,background-color,border-color,box-shadow] duration-200 before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] hover:translate-x-1 hover:border-primary/40 hover:bg-primary-soft/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-x-0",
        row.isLate ? 'before:bg-destructive' : ATTENTION_ACCENT_CLASSES[row.status],
      )}
      href={`/groups/${row.groupId}/forms/${row.formId}/submissions`}
    >
      <span className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">
          <span className="font-normal tabular-nums text-muted-foreground">
            {row.studentId ?? t('studentIdMissing')}
          </span>{' '}
          {row.firstNameTh} {row.lastNameTh}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {row.formTitle} · {row.groupName}
        </span>
      </span>
      <StatusBadge tone={STATUS_TONES[row.status]}>{t(`status.${row.status}`)}</StatusBadge>
      <span className="w-32 shrink-0 text-sm">
        {row.deadlineAt === null ? (
          <span className="text-muted-foreground">{t('noDeadline')}</span>
        ) : row.isLate ? (
          /* Overdue is the one thing on this row that changes what to do
             next, so it is the only value that takes a colour. */
          <span className="flex flex-col font-medium text-destructive">
            <span className="flex items-center gap-1.5 text-xs">
              <span aria-hidden="true" className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-destructive" />
              </span>
              {t('overdue')}
            </span>
            {formatBangkokDate(row.deadlineAt)}
          </span>
        ) : (
          <span className="text-muted-foreground">{formatBangkokDate(row.deadlineAt)}</span>
        )}
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
      />
    </Link>
  );
}
