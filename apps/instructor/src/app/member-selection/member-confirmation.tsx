'use client';

import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { SelectableStudent } from '@/lib/member-selection-contract';
import { CsvProblemList } from './csv-import';
import type { CsvImportProblem } from './member-selection-state';

// Names fade in one after another, but no name waits longer than the cap.
const ITEM_STAGGER_MILLISECONDS = 25;
const MAX_ITEM_STAGGER_STEPS = 12;

/*
 * The whole list is shown before anything is written: the Instructor confirms
 * names, not a count. Students Core refused at the last recheck are named here.
 */
export function MemberConfirmation({
  csvProblems,
  ineligible,
  openFormsCount,
  students,
}: {
  csvProblems: CsvImportProblem[];
  ineligible: SelectableStudent[];
  openFormsCount: number | null;
  students: SelectableStudent[];
}) {
  const t = useTranslations('Groups.selection');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <IneligibleNotice students={ineligible} />

      <p className="text-sm font-medium text-foreground">
        {t('confirmTotal', { count: students.length })}
      </p>
      {openFormsCount !== null ? (
        <p className="text-sm text-muted-foreground">
          {t('confirmOpenForms', { count: openFormsCount })}
        </p>
      ) : null}

      <ol
        aria-label={t('confirmListLabel')}
        className="max-h-[28rem] min-h-32 flex-1 list-decimal overflow-y-auto rounded-surface border border-border/80 py-2 pr-4 pl-10 text-sm"
      >
        {students.map((student, index) => (
          <li
            className="animate-in py-0.5 duration-300 fill-mode-both fade-in slide-in-from-left-1 motion-reduce:animate-none"
            key={student.accountId}
            style={{
              animationDelay: `${Math.min(index, MAX_ITEM_STAGGER_STEPS) * ITEM_STAGGER_MILLISECONDS}ms`,
            }}
          >
            <span className="text-muted-foreground tabular-nums">
              {student.studentId ?? t('studentIdMissing')}
            </span>{' '}
            {student.firstNameTh} {student.lastNameTh}
            <span className="text-muted-foreground"> · {student.entryYear}</span>
          </li>
        ))}
      </ol>

      {csvProblems.length > 0 ? <CsvProblemList problems={csvProblems} /> : null}
    </div>
  );
}

/* Students Core refused at the last recheck, named so the Instructor knows who left the list. */
export function IneligibleNotice({ students }: { students: SelectableStudent[] }) {
  const t = useTranslations('Groups.selection');
  if (students.length === 0) return null;
  return (
    <Alert variant="warning">
      <AlertTitle>{t('ineligibleTitle')}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {students.map((student) => (
            <li key={student.accountId}>
              <span className="tabular-nums">{student.studentId ?? t('studentIdMissing')}</span>{' '}
              {student.firstNameTh} {student.lastNameTh}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
