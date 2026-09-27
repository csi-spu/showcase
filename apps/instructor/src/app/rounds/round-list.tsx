'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  CalendarRangeIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageNav } from '@/components/ui/page-nav';
import { StatusBadge } from '@/components/ui/status-badge';
import { ENTRANCE_CLASS, staggerDelay } from '@/lib/motion';
import {
  ROUND_PAGE_SIZE,
  ROUND_SORTS,
  viewRoundList,
  type RoundListItem,
  type RoundSort,
  type RoundStatusFilter,
} from './round-list-view';

const STATUS_FILTERS: readonly RoundStatusFilter[] = ['all', 'active', 'closed'];

const STATUS_LABEL_KEYS = {
  active: 'round.statusActive',
  all: 'round.filterAll',
  closed: 'round.statusClosed',
} as const satisfies Record<RoundStatusFilter, string>;

const SORT_LABEL_KEYS = {
  name: 'round.sortName',
  newest: 'round.sortNewest',
  oldest: 'round.sortOldest',
} as const satisfies Record<RoundSort, string>;

const SELECT_CLASS =
  'h-10 w-full cursor-pointer appearance-none rounded-surface border border-input bg-background px-3 pr-9 text-sm transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

/**
 * The Instructor's rounds as cards, with status tabs, a name search, a sort
 * and pages. `initialStatus` lets a link elsewhere on the page open the list
 * already filtered.
 */
export function RoundList({
  initialStatus = 'all',
  rounds,
}: {
  initialStatus?: RoundStatusFilter;
  rounds: RoundListItem[];
}) {
  const t = useTranslations('Groups');
  const searchId = useId();
  const sortId = useId();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RoundStatusFilter>(initialStatus);
  const [sort, setSort] = useState<RoundSort>('newest');
  const [page, setPage] = useState(1);
  const view = useMemo(
    () => viewRoundList(rounds, { page, search, sort, status }),
    [page, rounds, search, sort, status],
  );
  const from = view.total === 0 ? 0 : (view.page - 1) * ROUND_PAGE_SIZE + 1;
  const to = Math.min(view.page * ROUND_PAGE_SIZE, view.total);

  /* Any change to what is listed starts again from its first page. */
  const resetPage =
    <Value,>(set: (value: Value) => void) =>
    (value: Value) => {
      set(value);
      setPage(1);
    };

  return (
    <section
      aria-labelledby="round-list-title"
      className={cn('flex scroll-mt-6 flex-col gap-4', ENTRANCE_CLASS)}
      id="round-list"
      style={staggerDelay(0, 320)}
    >
      <div className="flex flex-col gap-1">
        <h2
          className="text-xl leading-tight font-semibold tracking-tight text-foreground"
          id="round-list-title"
        >
          {t('round.listTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('round.listDescription')}</p>
      </div>

      <div aria-label={t('round.filterLabel')} className="flex flex-wrap gap-1.5" role="group">
        {STATUS_FILTERS.map((item) => {
          const isActive = item === status;
          return (
            <button
              aria-pressed={isActive}
              className={cn(
                'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,scale] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
              key={item}
              onClick={() => resetPage(setStatus)(item)}
              type="button"
            >
              {t(STATUS_LABEL_KEYS[item])}{' '}
              <span
                className={cn(
                  'min-w-5 animate-in rounded-full px-1.5 text-center text-xs tabular-nums duration-300 zoom-in-75 motion-reduce:animate-none',
                  isActive ? 'bg-primary-foreground/20' : 'bg-muted',
                )}
                key={view.statusCounts[item]}
              >
                {view.statusCounts[item]}
              </span>
            </button>
          );
        })}
      </div>

      <div
        aria-label={t('round.filtersLabel')}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        role="search"
      >
        <Field className="flex-1">
          <FieldLabel htmlFor={searchId}>{t('round.searchLabel')}</FieldLabel>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              id={searchId}
              maxLength={200}
              onChange={(event) => resetPage(setSearch)(event.target.value)}
              placeholder={t('round.searchPlaceholder')}
              type="search"
              value={search}
            />
          </div>
        </Field>
        <Field className="sm:w-56">
          <FieldLabel htmlFor={sortId}>{t('round.sortLabel')}</FieldLabel>
          <div className="relative">
            <select
              className={SELECT_CLASS}
              id={sortId}
              onChange={(event) => {
                const next = ROUND_SORTS.find((candidate) => candidate === event.target.value);
                if (next !== undefined) resetPage(setSort)(next);
              }}
              value={sort}
            >
              {ROUND_SORTS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {t(SORT_LABEL_KEYS[candidate])}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </Field>
      </div>

      {view.total === 0 ? (
        <EmptyState
          action={
            <Button
              onClick={() => {
                setSearch('');
                setStatus('all');
                setPage(1);
              }}
              variant="outline"
            >
              <XIcon aria-hidden="true" data-icon="inline-start" />
              {t('round.clearFilters')}
            </Button>
          }
          description={t('round.noMatchDescription')}
          icon={SearchXIcon}
          title={t('round.noMatch')}
        />
      ) : (
        // Keyed on what is listed, so a new filter or page replays the entrance.
        <ul className="grid gap-3 md:grid-cols-2" key={`${status}|${search}|${sort}|${view.page}`}>
          {view.rows.map((round, index) => (
            <li className={cn('h-full', ENTRANCE_CLASS)} key={round.id} style={staggerDelay(index)}>
              <RoundCard round={round} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          <span
            className="inline-block animate-in duration-300 fade-in motion-reduce:animate-none"
            key={`${from}-${to}-${view.total}`}
          >
            {t('round.resultCount', { from, to, total: view.total })}
          </span>
        </p>
        {view.pageCount > 1 ? (
          <PageNav
            labels={{
              nav: t('round.paginationLabel'),
              next: t('round.nextPage'),
              page: (item) => t('round.pageLabel', { page: item }),
              previous: t('round.previousPage'),
            }}
            onPageChange={setPage}
            page={view.page}
            pageCount={view.pageCount}
          />
        ) : null}
      </div>
    </section>
  );
}

function RoundCard({ round }: { round: RoundListItem }) {
  const t = useTranslations('Groups');
  const isActive = round.status === 'active';

  return (
    <Link
      className="group relative flex h-full min-h-24 items-center gap-4 overflow-hidden rounded-surface border border-border/80 bg-card px-5 py-4 outline-none transition-[translate,scale,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      href={`/rounds/${round.id}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-1 transition-[width] duration-200 group-hover:w-1.5 motion-reduce:transition-none',
          isActive ? 'bg-success' : 'bg-muted-foreground/40',
        )}
      />
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transition-none motion-reduce:group-hover:transform-none',
          isActive ? 'bg-success-background text-success' : 'bg-muted text-muted-foreground',
        )}
      >
        <CalendarRangeIcon aria-hidden="true" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="line-clamp-2 font-medium text-foreground">{round.name}</span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge
            icon={isActive ? CircleDotIcon : CheckCircle2Icon}
            tone={isActive ? 'success' : 'muted'}
          >
            {isActive ? t('round.statusActive') : t('round.statusClosed')}
          </StatusBadge>
          <span>{round.createdAtLabel}</span>
        </span>
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
      />
    </Link>
  );
}
