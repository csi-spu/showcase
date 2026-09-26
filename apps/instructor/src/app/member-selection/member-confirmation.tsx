'use client';

import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { SelectableStudent } from '@/lib/member-selection-contract';
import { CsvProblemList } from './csv-import';
import type { CsvImportProblem } from './member-selection-state';

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
    <div className="flex flex-col gap-3">
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
        className="max-h-80 list-decimal overflow-y-auto rounded-surface border border-border/80 py-2 pr-4 pl-10 text-sm"
      >
        {students.map((student) => (
          <li className="py-0.5" key={student.accountId}>
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
              {student.firstNameTh} {student.lastNameTh}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
