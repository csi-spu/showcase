'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ChevronDownIcon, ListChecksIcon, SearchIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, type Dispatch } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MAX_SELECTED_MEMBERS,
  type MemberSelectionReads,
  type SelectableStudent,
  type SelectionStatus,
} from '@/lib/member-selection-contract';
import type { MemberSelectionEvent } from './member-selection-state';

const SEARCH_DEBOUNCE_MILLISECONDS = 300;
// Rows fade in one after another, but no row waits longer than the cap.
const ROW_STAGGER_MILLISECONDS = 30;
const MAX_ROW_STAGGER_STEPS = 8;
const SKELETON_ROW_COUNT = 6;

const STATUS_TONES: Record<SelectionStatus, StatusTone> = {
  current_member: 'information',
  no_access: 'warning',
  selectable: 'success',
  withdrawn_member: 'muted',
};

interface StudentPage {
  hasCurrentAcademicYear: boolean;
  /** The filter this page answers; the table is loading while it differs from the current one. */
  key: string;
  nextCursor: string | null;
  status: 'failed' | 'ready';
  students: SelectableStudent[];
}

type SelectAllState =
  { status: 'failed' | 'idle' | 'pending' } | { matchingCount: number; status: 'limit' };

/*
 * The unfiltered roster of active Student Accounts, narrowed by Entry Year and
 * partial Roster name or Student ID prefix. The search text stays in component
 * state and a request body, never the URL. Rows that cannot be selected stay
 * visible with their status so the Instructor sees why.
 */
export function StudentPicker({
  dispatch,
  groupId,
  reads,
  selection,
}: {
  dispatch: Dispatch<MemberSelectionEvent>;
  groupId: string | null;
  reads: MemberSelectionReads;
  selection: ReadonlyMap<string, SelectableStudent>;
}) {
  const t = useTranslations('Groups.selection');
  const entryYearId = useId();
  const nameId = useId();
  const [entryYears, setEntryYears] = useState<number[]>([]);
  const [entryYear, setEntryYear] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [query, setQuery] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const [page, setPage] = useState<StudentPage | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectAll, setSelectAll] = useState<SelectAllState>({ status: 'idle' });
  const q = query.length === 0 ? null : query;
  const filterKey = JSON.stringify([entryYear, q, reloadCount]);
  const isLoading = page?.key !== filterKey;

  useEffect(() => {
    let isCurrent = true;
    void reads.listEntryYears().then((result) => {
      if (isCurrent && result.ok) setEntryYears(result.entryYears);
    });
    return () => {
      isCurrent = false;
    };
  }, [reads]);

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(nameInput.trim()), SEARCH_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(timeout);
  }, [nameInput]);

  useEffect(() => {
    let isCurrent = true;
    const settle = (next: Omit<StudentPage, 'key'>) => {
      if (isCurrent) setPage({ ...next, key: filterKey });
    };
    reads.listStudents({ cursor: null, entryYear, groupId, q }).then(
      (result) =>
        settle(
          result.ok
            ? { ...result, status: 'ready' }
            : { hasCurrentAcademicYear: true, nextCursor: null, status: 'failed', students: [] },
        ),
      () =>
        settle({ hasCurrentAcademicYear: true, nextCursor: null, status: 'failed', students: [] }),
    );
    return () => {
      isCurrent = false;
    };
  }, [entryYear, filterKey, groupId, q, reads]);

  async function loadMore(cursor: string): Promise<void> {
    setIsLoadingMore(true);
    try {
      const result = await reads.listStudents({ cursor, entryYear, groupId, q });
      if (!result.ok) return;
      setPage((current) =>
        current?.key === filterKey
          ? {
              ...current,
              nextCursor: result.nextCursor,
              students: [...current.students, ...result.students],
            }
          : current,
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function selectAllMatching(): Promise<void> {
    setSelectAll({ status: 'pending' });
    try {
      const result = await reads.selectAll({
        entryYear,
        groupId,
        q,
        selectedCount: selection.size,
      });
      if (result.ok) {
        dispatch({ students: result.students, type: 'selectedMany' });
        setSelectAll({ status: 'idle' });
      } else if (result.error === 'selectionLimitExceeded') {
        setSelectAll({ matchingCount: result.matchingCount, status: 'limit' });
      } else {
        setSelectAll({ status: 'failed' });
      }
    } catch {
      setSelectAll({ status: 'failed' });
    }
  }

  const students = isLoading ? [] : (page?.students ?? []);
  const nextCursor = isLoading ? null : (page?.nextCursor ?? null);
  const hasCurrentAcademicYear = page?.hasCurrentAcademicYear ?? true;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        aria-label={t('filtersLabel')}
        className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end"
        role="search"
      >
        <Field className="sm:w-48">
          <FieldLabel htmlFor={entryYearId}>{t('entryYearFilter')}</FieldLabel>
          <div className="relative">
            <select
              className="h-10 w-full cursor-pointer appearance-none rounded-surface border border-input bg-background px-3 pr-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              id={entryYearId}
              onChange={(event) => {
                setEntryYear(event.target.value === '' ? null : Number(event.target.value));
                setSelectAll({ status: 'idle' });
              }}
              value={entryYear ?? ''}
            >
              <option value="">{t('allEntryYears')}</option>
              {entryYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </Field>
        <Field className="flex-1">
          <FieldLabel htmlFor={nameId}>{t('nameFilter')}</FieldLabel>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              id={nameId}
              maxLength={100}
              onChange={(event) => {
                setNameInput(event.target.value);
                setSelectAll({ status: 'idle' });
              }}
              placeholder={t('namePlaceholder')}
              type="search"
              value={nameInput}
            />
          </div>
        </Field>
      </div>

      {!hasCurrentAcademicYear ? (
        <Alert variant="warning">
          <AlertTitle>{t('noAcademicYearTitle')}</AlertTitle>
          <AlertDescription>{t('noAcademicYear')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm font-medium text-foreground">
          {/* Re-keyed so every change pops, drawing the eye to the new count. */}
          <span
            className="inline-block animate-in duration-200 zoom-in-90 fade-in motion-reduce:animate-none"
            key={selection.size}
          >
            {t('selectedCount', { count: selection.size, max: MAX_SELECTED_MEMBERS })}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              isLoading ||
              !hasCurrentAcademicYear ||
              selection.size >= MAX_SELECTED_MEMBERS ||
              selectAll.status === 'pending'
            }
            onClick={() => void selectAllMatching()}
            size="sm"
            type="button"
            variant="outline"
          >
            {selectAll.status === 'pending' ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <ListChecksIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {t('selectAll')}
          </Button>
          <Button
            disabled={selection.size === 0}
            onClick={() => dispatch({ type: 'cleared' })}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('clear')}
          </Button>
        </div>
      </div>

      {selectAll.status === 'limit' ? (
        <Alert variant="warning">
          <AlertDescription>
            {t('selectAllLimit', { matchingCount: selectAll.matchingCount })}
          </AlertDescription>
        </Alert>
      ) : null}
      {selectAll.status === 'failed' ? (
        <Alert variant="destructive">
          <AlertDescription>{t('selectAllFailed')}</AlertDescription>
        </Alert>
      ) : null}

      {/* The only part that scrolls: filters and actions stay in view. */}
      <Table
        containerClassName="max-h-[32rem] min-h-40 flex-1 overflow-y-auto"
        label={t('tableLabel')}
      >
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <TableHead className="w-12">
              <span className="sr-only">{t('columnSelect')}</span>
            </TableHead>
            <TableHead>{t('columnStudentId')}</TableHead>
            <TableHead>{t('columnName')}</TableHead>
            <TableHead>{t('columnEntryYear')}</TableHead>
            <TableHead>{t('columnStatus')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                <TableRow aria-hidden="true" className="hover:bg-transparent" key={index}>
                  <TableCell>
                    <span className="block size-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
                  </TableCell>
                  <TableCell>
                    <span className="block h-4 w-20 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
                  </TableCell>
                  <TableCell>
                    <span className="block h-4 w-40 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
                  </TableCell>
                  <TableCell>
                    <span className="block h-4 w-12 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
                  </TableCell>
                  <TableCell>
                    <span className="block h-5 w-20 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {students.map((student, index) => {
            const name = `${student.firstNameTh} ${student.lastNameTh}`;
            const isSelected = selection.has(student.accountId);
            return (
              <TableRow
                className={cn(
                  'animate-in duration-300 fill-mode-both fade-in slide-in-from-bottom-1 motion-reduce:animate-none',
                  isSelected && 'bg-primary-soft hover:bg-primary-soft',
                )}
                key={student.accountId}
                style={{
                  animationDelay: `${Math.min(index, MAX_ROW_STAGGER_STEPS) * ROW_STAGGER_MILLISECONDS}ms`,
                }}
              >
                <TableCell>
                  <input
                    aria-label={t('selectStudent', { name })}
                    checked={isSelected}
                    className="size-4 cursor-pointer rounded-sm accent-primary transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary enabled:hover:scale-115 enabled:active:scale-95 disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:enabled:hover:scale-100"
                    disabled={!isSelected && student.status !== 'selectable'}
                    onChange={() => dispatch({ student, type: 'toggled' })}
                    type="checkbox"
                  />
                </TableCell>
                <TableCell className="tabular-nums">
                  {student.studentId ?? t('studentIdMissing')}
                </TableCell>
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell>{student.entryYear}</TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS_TONES[student.status]}>
                    {t(`status.${student.status}`)}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {isLoading ? (
        <p className="sr-only" role="status">
          {t('loading')}
        </p>
      ) : page?.status === 'failed' ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {t('loadFailed')}
            <Button
              onClick={() => setReloadCount((count) => count + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t('empty')}
        </p>
      ) : nextCursor !== null ? (
        <Button
          className="shrink-0 self-center"
          disabled={isLoadingMore}
          onClick={() => void loadMore(nextCursor)}
          type="button"
          variant="outline"
        >
          {isLoadingMore ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
          {t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
