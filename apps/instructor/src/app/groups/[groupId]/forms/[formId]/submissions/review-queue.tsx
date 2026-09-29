'use client';

import { Button, buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ClipboardCheckIcon, InboxIcon, RotateCcwIcon, SearchXIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { readReviewQueueAction } from '@/app/collection-forms.actions';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  InstructorReviewEntry,
  InstructorReviewQueuePage,
  ReviewQueueReadResult,
} from '@/lib/instructor-collection-forms-contract';
import { ENTRANCE_CLASS, staggerDelay } from '@/lib/motion';
import {
  DEFAULT_REVIEW_DISPLAY,
  ReviewPagination,
  ReviewToolbar,
  StatusTabs,
  type ReviewDisplay,
} from './review-queue-controls';
import {
  REVIEW_STATUS_ORDER,
  reviewPageCount,
  toReviewOrder,
  toStatusTabCounts,
  type ReviewPageSize,
  type ReviewSort,
  type ReviewStatusFilter,
} from './review-queue-view';
import { studentHref, submissionsHref, type IndividualQuery } from './responses-query';
import { STATUS_TONES } from './review-status';

const STATUS_ACCENT_CLASSES: Record<InstructorReviewEntry['status'], string> = {
  awaiting_checking: 'before:bg-information',
  changes_required: 'before:bg-warning',
  not_submitted: 'before:bg-muted-foreground/40',
  passed: 'before:bg-success',
  withdrawn: 'before:bg-muted-foreground/20',
};

const ROW_ENTRANCE_CLASS =
  'animate-in duration-300 fill-mode-both fade-in slide-in-from-bottom-1 motion-reduce:animate-none';

const SEARCH_DEBOUNCE_MILLISECONDS = 300;

/** Which read a shown page answers, so a late response for an older one is dropped. */
function readKey(query: IndividualQuery, search: string, attempt: number): string {
  return JSON.stringify([query.page, query.pageSize, query.sort, query.status, search, attempt]);
}

/**
 * The Individual index: every assigned Student, one row each.
 *
 * Core filters, orders and pages the queue, so a group of any size lists every
 * Student. Status, order, page and page size are mirrored into the URL so a
 * Student's page can return to the same place and follow the same order. The
 * search term never is: it can hold a Student ID, which must stay out of URLs
 * (ADR 0020), so it reaches Core only in a request body.
 */
export function ReviewQueue({
  formId,
  groupId,
  initialQuery,
  initialQueue,
}: {
  formId: string;
  groupId: string;
  initialQuery: IndividualQuery;
  /** The page the server read for `initialQuery`, without a search. */
  initialQueue: InstructorReviewQueuePage;
}) {
  const t = useTranslations('Forms');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<IndividualQuery>(initialQuery);
  const [attempt, setAttempt] = useState(0);
  /* The last page read, kept on screen while the next one loads or if it fails. */
  const [shown, setShown] = useState({
    key: readKey(initialQuery, '', 0),
    pageSize: initialQuery.pageSize,
    queue: initialQueue,
  });
  const [read, setRead] = useState({ isFailed: false, key: shown.key });
  const [display, setDisplay] = useState<ReviewDisplay>(DEFAULT_REVIEW_DISPLAY);
  /* The server read had no search, so its counts are every assigned Student. */
  const [hasStudents] = useState(() =>
    REVIEW_STATUS_ORDER.some((status) => initialQueue.statusCounts[status] > 0),
  );
  const key = readKey(query, search, attempt);
  const isLoading = read.key !== key;
  const { pageSize, sort, status } = query;
  const { queue } = shown;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setSearch(next);
      setQuery((current) => ({ ...current, page: 1 }));
    }, SEARCH_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(timeout);
  }, [search, searchInput]);

  /*
   * The URL follows every change to what is listed, including the return to
   * page one a new search makes. Replacing the entry keeps Back meaning "the
   * page before this list" rather than stepping through every filter tried.
   */
  useEffect(() => {
    if (query === initialQuery) return;
    window.history.replaceState(
      null,
      '',
      submissionsHref(groupId, formId, { ...query, view: 'individual' }),
    );
  }, [formId, groupId, initialQuery, query]);

  useEffect(() => {
    if (!isLoading) return;
    let isCurrent = true;
    const settle = (result: ReviewQueueReadResult) => {
      if (!isCurrent) return;
      if (result.ok) setShown({ key, pageSize: query.pageSize, queue: result.queue });
      setRead({ isFailed: !result.ok, key });
    };
    readReviewQueueAction(formId, { ...toReviewOrder(query), page: query.page, search }).then(
      settle,
      /* A dropped connection is retried like any other failed read. */
      () => settle({ ok: false }),
    );
    return () => {
      isCurrent = false;
    };
  }, [formId, isLoading, key, query, search]);

  if (!hasStudents) {
    return (
      <EmptyState
        description={t('review.emptyDescription')}
        icon={InboxIcon}
        title={t('review.empty')}
      />
    );
  }

  const setPage = (next: number) => setQuery({ ...query, page: next });
  /* Any change to what is listed starts again from its first page. */
  const setStatus = (next: ReviewStatusFilter) => setQuery({ ...query, page: 1, status: next });
  const setSort = (next: ReviewSort) => setQuery({ ...query, page: 1, sort: next });
  const changePageSize = (next: ReviewPageSize) => setQuery({ ...query, page: 1, pageSize: next });
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setQuery({ ...query, page: 1, status: 'all' });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={cn('flex flex-col gap-4', ENTRANCE_CLASS)}>
        <StatusTabs
          counts={toStatusTabCounts(queue.statusCounts)}
          onChange={setStatus}
          value={status}
        />
        <ReviewToolbar
          display={display}
          onDisplayChange={setDisplay}
          onSearchChange={setSearchInput}
          onSortChange={setSort}
          search={searchInput}
          sort={sort}
        />
      </div>

      {read.isFailed && !isLoading ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
          {t('review.loadFailed')}
          <Button
            className="active:scale-95"
            onClick={() => setAttempt((current) => current + 1)}
            size="sm"
            variant="outline"
          >
            <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
            {t('review.retry')}
          </Button>
        </div>
      ) : null}

      {queue.total === 0 ? (
        <EmptyState
          action={
            <Button onClick={clearFilters} variant="outline">
              <XIcon aria-hidden="true" data-icon="inline-start" />
              {t('review.clearFilters')}
            </Button>
          }
          description={t('review.noMatchDescription')}
          icon={SearchXIcon}
          title={t('review.noMatch')}
        />
      ) : (
        <>
          <Table
            containerClassName={cn(
              ENTRANCE_CLASS,
              'transition-opacity motion-reduce:transition-none',
              isLoading && 'opacity-60',
            )}
            label={t('review.pageTitle')}
          >
            <TableHeader>
              <TableRow>
                <TableHead>{t('review.columnStudentId')}</TableHead>
                <TableHead>{t('review.columnName')}</TableHead>
                <TableHead>{t('review.columnStatus')}</TableHead>
                {display.submittedAt ? (
                  <TableHead className="hidden sm:table-cell">
                    {t('review.columnSubmittedAt')}
                  </TableHead>
                ) : null}
                {display.firstSubmittedAt ? (
                  <TableHead className="hidden md:table-cell">
                    {t('review.columnFirstSubmittedAt')}
                  </TableHead>
                ) : null}
                {display.version ? (
                  <TableHead className="hidden md:table-cell">
                    {t('review.columnVersion')}
                  </TableHead>
                ) : null}
                <TableHead className="text-right">{t('review.columnActions')}</TableHead>
              </TableRow>
            </TableHeader>
            {/* Re-keyed on what is listed, so a new page or filter replays the rows' entrance. */}
            <TableBody aria-busy={isLoading} key={shown.key}>
              {queue.entries.map((entry, index) => (
                <ReviewRow
                  display={display}
                  entry={entry}
                  href={studentHref(groupId, formId, entry.studentAccountId, {
                    pageSize,
                    sort,
                    status,
                  })}
                  index={index}
                  key={entry.studentAccountId}
                />
              ))}
            </TableBody>
          </Table>
          <ReviewPagination
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
            page={queue.page}
            pageCount={reviewPageCount(queue.total, shown.pageSize)}
            pageSize={shown.pageSize}
            total={queue.total}
          />
        </>
      )}
    </div>
  );
}

/*
 * The whole row opens the Student's page for pointer users; the name and the
 * review action are the same destination as real links, so keyboard and
 * assistive technology reach it without the row being a control itself.
 */
function ReviewRow({
  display,
  entry,
  href,
  index,
}: {
  display: ReviewDisplay;
  entry: InstructorReviewEntry;
  href: string;
  index: number;
}) {
  const t = useTranslations('Forms');
  const format = useFormatter();
  const router = useRouter();
  const name = `${entry.rosterName.firstNameTh} ${entry.rosterName.lastNameTh}`;
  const submission = entry.latestSubmission;
  const formatDateTime = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <TableRow
      className={cn('group/row cursor-pointer', ROW_ENTRANCE_CLASS)}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a, button') !== null) return;
        router.push(href);
      }}
      style={staggerDelay(index)}
    >
      {/* The accent repeats the status in colour down the left edge, so the
          queue can be scanned by colour; the badge still states it in words. */}
      <TableCell
        className={cn(
          "relative text-muted-foreground tabular-nums before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:content-['']",
          STATUS_ACCENT_CLASSES[entry.status],
        )}
      >
        {entry.studentId ?? t('review.studentIdMissing')}
      </TableCell>
      <TableCell className="font-medium">
        <Link
          className="rounded-control transition-colors outline-none group-hover/row:text-primary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          href={href}
        >
          {name}
        </Link>
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={STATUS_TONES[entry.status]}>
            {t(`obligationStatus.${entry.status}`)}
          </StatusBadge>
          {entry.isLate ? (
            <StatusBadge tone="destructive">
              {submission === null ? t('review.overdue') : t('review.late')}
            </StatusBadge>
          ) : null}
        </span>
      </TableCell>
      {display.submittedAt ? (
        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
          {submission === null
            ? t('review.notSubmittedYet')
            : formatDateTime(submission.submittedAt)}
        </TableCell>
      ) : null}
      {display.firstSubmittedAt ? (
        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
          {entry.firstSubmittedAt === null
            ? t('review.notSubmittedYet')
            : formatDateTime(entry.firstSubmittedAt)}
        </TableCell>
      ) : null}
      {display.version ? (
        <TableCell className="hidden text-sm text-muted-foreground tabular-nums md:table-cell">
          {submission === null ? '–' : submission.version}
        </TableCell>
      ) : null}
      <TableCell className="text-right">
        {submission === null ? (
          <span className="text-sm text-muted-foreground">{t('review.noSubmissionAction')}</span>
        ) : (
          <Link
            aria-label={t('review.openActionLabel', { name })}
            className={cn(
              buttonVariants({
                size: 'sm',
                variant: entry.status === 'awaiting_checking' ? 'default' : 'ghost',
              }),
              'transition-[background-color,color,scale] active:scale-95 motion-reduce:transition-none',
            )}
            href={href}
          >
            {entry.status === 'awaiting_checking' ? (
              <ClipboardCheckIcon aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {t('review.openAction')}
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}
