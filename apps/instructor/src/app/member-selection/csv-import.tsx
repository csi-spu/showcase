'use client';

import { Button, buttonVariants } from '@showcase/ui/button';
import { DownloadIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, type ChangeEvent, type Dispatch } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { MAX_SELECTED_MEMBERS, type MemberSelectionReads } from '@/lib/member-selection-contract';
import { decodeCsvBytes, MAX_CSV_BYTES, parseStudentIdCsv } from '@/lib/student-id-csv';
import { mapResolvedChunk } from '@/lib/student-id-resolution';
import {
  csvProblems,
  csvProgress,
  type CsvImport as CsvImportState,
  type CsvImportProblem,
  type MemberSelectionEvent,
  type MemberSelectionState,
} from './member-selection-state';

export const SAMPLE_CSV_PATH = '/samples/member-selection-sample.csv';

/*
 * Reads the file in the browser and resolves its Student IDs through Core one
 * chunk at a time. A failed chunk keeps its place and can be retried alone.
 */
export function CsvImport({
  dispatch,
  groupId,
  reads,
  state,
}: {
  dispatch: Dispatch<MemberSelectionEvent>;
  groupId: string | null;
  reads: MemberSelectionReads;
  state: Pick<MemberSelectionState, 'csv' | 'csvError'>;
}) {
  const t = useTranslations('Groups.selection');
  const inputId = useId();
  const { csv, csvError } = state;
  const importId = csv?.importId ?? null;
  const pendingIndex = csv?.chunks.findIndex((chunk) => chunk.status === 'pending') ?? -1;
  const pendingEntries = pendingIndex === -1 ? null : (csv?.chunks[pendingIndex]?.entries ?? null);

  useEffect(() => {
    if (importId === null || pendingEntries === null) return;
    let isCurrent = true;
    const chunk = { chunkIndex: pendingIndex, importId };
    reads
      .resolveStudentIds({ groupId, studentIds: pendingEntries.map((entry) => entry.studentId) })
      .then(
        (result) => {
          if (!isCurrent) return;
          if (!result.ok) {
            dispatch({ ...chunk, type: 'chunkFailed' });
            return;
          }
          try {
            dispatch({
              ...chunk,
              ...mapResolvedChunk(pendingEntries, result.results),
              type: 'chunkResolved',
            });
          } catch {
            dispatch({ ...chunk, type: 'chunkFailed' });
          }
        },
        () => {
          if (isCurrent) dispatch({ ...chunk, type: 'chunkFailed' });
        },
      );
    return () => {
      isCurrent = false;
    };
  }, [dispatch, groupId, importId, pendingEntries, pendingIndex, reads]);

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be chosen again after it changes.
    event.target.value = '';
    if (file === undefined) return;
    if (file.size > MAX_CSV_BYTES) {
      dispatch({ error: 'too_large', type: 'csvRejected' });
      return;
    }
    const text = decodeCsvBytes(await file.arrayBuffer());
    if (text === null) {
      dispatch({ error: 'not_utf8', type: 'csvRejected' });
      return;
    }
    const parsed = parseStudentIdCsv(text);
    if (!parsed.ok) {
      dispatch({ error: parsed.error, type: 'csvRejected' });
      return;
    }
    dispatch({
      entries: parsed.entries,
      fileName: file.name,
      lineProblems: parsed.problems,
      type: 'csvParsed',
    });
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="flex flex-col gap-3 rounded-surface border border-border/80 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground" id={`${inputId}-title`}>
          {t('csvTitle')}
        </h4>
        <a
          className={buttonVariants({ size: 'sm', variant: 'link' })}
          download
          href={SAMPLE_CSV_PATH}
        >
          <DownloadIcon aria-hidden="true" data-icon="inline-start" />
          {t('csvSample')}
        </a>
      </div>
      <Field>
        <FieldLabel htmlFor={inputId}>{t('csvLabel')}</FieldLabel>
        <input
          accept=".csv,text/csv"
          aria-describedby={`${inputId}-description`}
          className="text-sm file:mr-3 file:rounded-control file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          id={inputId}
          onChange={(event) => void readFile(event)}
          type="file"
        />
        <FieldDescription id={`${inputId}-description`}>{t('csvDescription')}</FieldDescription>
      </Field>

      {csvError !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`csvError.${csvError}`)}</AlertDescription>
        </Alert>
      ) : null}
      {csv !== null ? <CsvImportStatus csv={csv} dispatch={dispatch} /> : null}
    </section>
  );
}

function CsvImportStatus({
  csv,
  dispatch,
}: {
  csv: CsvImportState;
  dispatch: Dispatch<MemberSelectionEvent>;
}) {
  const t = useTranslations('Groups.selection');
  const progress = csvProgress(csv);
  const problems = csvProblems(csv);
  const resolvedCount = csv.chunks.filter((chunk) => chunk.status !== 'pending').length;
  const entryCount = csv.chunks.reduce((total, chunk) => total + chunk.entries.length, 0);
  const unresolvedCount = csv.chunks
    .filter((chunk) => chunk.status !== 'resolved')
    .reduce((total, chunk) => total + chunk.entries.length, 0);
  const matchedCount =
    entryCount -
    unresolvedCount -
    problems.filter((problem) => isResolutionProblem(problem)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div aria-live="polite" className="flex flex-col gap-0.5 text-sm">
          <span className="font-medium text-foreground">
            {t('csvFile', { fileName: csv.fileName })}
          </span>
          {progress === 'pending' ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Spinner aria-hidden="true" />
              {t('csvChecking', { done: resolvedCount, total: csv.chunks.length })}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t('csvResult', { matched: matchedCount, problems: problems.length })}
            </span>
          )}
        </div>
        <Button
          onClick={() => dispatch({ type: 'csvRemoved' })}
          size="sm"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden="true" data-icon="inline-start" />
          {t('csvRemove')}
        </Button>
      </div>

      {csv.chunks.map((chunk, chunkIndex) =>
        chunk.status === 'failed' ? (
          <Alert key={chunk.entries[0]?.line ?? chunkIndex} variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {t('csvChunkFailed', {
                from: chunk.entries[0]?.line ?? 0,
                to: chunk.entries.at(-1)?.line ?? 0,
              })}
              {progress === 'failed' ? (
                <Button
                  onClick={() =>
                    dispatch({ chunkIndex, importId: csv.importId, type: 'chunkRetried' })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
                  {t('csvRetry')}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null,
      )}

      {problems.length > 0 ? <CsvProblemList problems={problems} /> : null}
    </div>
  );
}

function isResolutionProblem(problem: CsvImportProblem): boolean {
  return problem.kind !== 'invalid_format' && problem.kind !== 'duplicate';
}

/* Problems are named by line; a not-found line shows the value from the browser's own file. */
export function CsvProblemList({ problems }: { problems: CsvImportProblem[] }) {
  const t = useTranslations('Groups.selection');
  return (
    <details className="rounded-surface bg-muted/60 px-4 py-3 text-sm" open={problems.length <= 10}>
      <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        {t('problemsTitle', { count: problems.length })}
      </summary>
      <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-muted-foreground">
        {problems.map((problem) => (
          <li key={`${problem.kind}-${problem.line}`}>{describeProblem(problem, t)}</li>
        ))}
      </ul>
    </details>
  );
}

function describeProblem(
  problem: CsvImportProblem,
  t: ReturnType<typeof useTranslations<'Groups.selection'>>,
): string {
  switch (problem.kind) {
    case 'invalid_format':
      return t('problem.invalid_format', { line: problem.line, value: problem.value });
    case 'duplicate':
      return t('problem.duplicate', {
        firstLine: problem.firstLine,
        line: problem.line,
        studentId: problem.studentId,
      });
    case 'not_found':
      return t('problem.not_found', { line: problem.line, studentId: problem.studentId });
    case 'over_limit':
      return t('problem.over_limit', {
        line: problem.line,
        max: MAX_SELECTED_MEMBERS,
        name: `${problem.student.firstNameTh} ${problem.student.lastNameTh}`,
      });
    default:
      return t(`problem.${problem.kind}`, {
        line: problem.line,
        name: `${problem.student.firstNameTh} ${problem.student.lastNameTh}`,
      });
  }
}
