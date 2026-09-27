'use client';

import { Menu } from '@base-ui/react/menu';
import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { CheckIcon, ChevronDownIcon, SearchIcon, Settings2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageNav } from '@/components/ui/page-nav';
import {
  REVIEW_PAGE_SIZES,
  REVIEW_STATUS_ORDER,
  type ReviewPageSize,
  type ReviewSort,
  type ReviewStatusFilter,
} from './review-queue-view';

/** What the Instructor has chosen to show; the name and review action always show. */
export interface ReviewDisplay {
  firstSubmittedAt: boolean;
  historyAction: boolean;
  submittedAt: boolean;
  version: boolean;
}

export const DEFAULT_REVIEW_DISPLAY: ReviewDisplay = {
  firstSubmittedAt: false,
  historyAction: true,
  submittedAt: true,
  version: true,
};

const SORTS: readonly ReviewSort[] = ['status', 'name', 'submittedDesc', 'submittedAsc'];

const SORT_LABEL_KEYS = {
  name: 'sortName',
  status: 'sortStatus',
  submittedAsc: 'sortSubmittedAsc',
  submittedDesc: 'sortSubmittedDesc',
} as const satisfies Record<ReviewSort, string>;

const SELECT_CLASS =
  'h-10 w-full cursor-pointer appearance-none rounded-surface border border-input bg-background px-3 pr-9 text-sm transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

const MENU_ITEM_CLASS =
  'grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-control px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted';

/**
 * One tab per status with its count, so the split of the queue is read before
 * any row is. Statuses nobody holds are left out unless they are selected.
 */
export function StatusTabs({
  counts,
  onChange,
  value,
}: {
  counts: Record<ReviewStatusFilter, number>;
  onChange: (value: ReviewStatusFilter) => void;
  value: ReviewStatusFilter;
}) {
  const t = useTranslations('Forms');
  const statuses: ReviewStatusFilter[] = [
    'all',
    ...REVIEW_STATUS_ORDER.filter((status) => counts[status] > 0 || status === value),
  ];

  return (
    <div aria-label={t('review.statusFilterLabel')} className="flex flex-wrap gap-1.5" role="group">
      {statuses.map((status) => {
        const isActive = status === value;
        return (
          <button
            aria-pressed={isActive}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,scale] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none',
              isActive
                ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
            key={status}
            onClick={() => onChange(status)}
            type="button"
          >
            {status === 'all' ? t('review.statusAll') : t(`obligationStatus.${status}`)}{' '}
            <span
              className={cn(
                'min-w-5 animate-in rounded-full px-1.5 text-center text-xs tabular-nums duration-300 zoom-in-75 motion-reduce:animate-none',
                isActive ? 'bg-primary-foreground/20' : 'bg-muted',
              )}
              key={counts[status]}
            >
              {counts[status]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ReviewToolbar({
  display,
  onDisplayChange,
  onSearchChange,
  onSortChange,
  search,
  sort,
}: {
  display: ReviewDisplay;
  onDisplayChange: (display: ReviewDisplay) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: ReviewSort) => void;
  search: string;
  sort: ReviewSort;
}) {
  const t = useTranslations('Forms');
  const searchId = useId();
  const sortId = useId();

  return (
    <div
      aria-label={t('review.filtersLabel')}
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
      role="search"
    >
      <Field className="flex-1">
        <FieldLabel htmlFor={searchId}>{t('review.searchLabel')}</FieldLabel>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-9"
            id={searchId}
            maxLength={100}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('review.searchPlaceholder')}
            type="search"
            value={search}
          />
        </div>
      </Field>

      <Field className="sm:w-56">
        <FieldLabel htmlFor={sortId}>{t('review.sortLabel')}</FieldLabel>
        <div className="relative">
          <select
            className={SELECT_CLASS}
            id={sortId}
            onChange={(event) => {
              const next = SORTS.find((candidate) => candidate === event.target.value);
              if (next !== undefined) onSortChange(next);
            }}
            value={sort}
          >
            {SORTS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {t(`review.${SORT_LABEL_KEYS[candidate]}`)}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </Field>

      <div className="flex flex-col gap-2 sm:pt-7">
        <DisplayMenu display={display} onChange={onDisplayChange} />
      </div>
    </div>
  );
}

function DisplayMenu({
  display,
  onChange,
}: {
  display: ReviewDisplay;
  onChange: (display: ReviewDisplay) => void;
}) {
  const t = useTranslations('Forms');
  const columns = [
    { key: 'submittedAt', label: t('review.columnSubmittedAt') },
    { key: 'firstSubmittedAt', label: t('review.columnFirstSubmittedAt') },
    { key: 'version', label: t('review.columnVersion') },
  ] as const;

  return (
    <Menu.Root>
      <Menu.Trigger className={cn(buttonVariants({ variant: 'outline' }), 'h-10 w-full sm:w-auto')}>
        <Settings2Icon aria-hidden="true" data-icon="inline-start" />
        {t('review.displayMenu')}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" className="z-50 outline-none" sideOffset={6}>
          <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-surface border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t('review.displayColumns')}
              </Menu.GroupLabel>
              {columns.map((column) => (
                <Menu.CheckboxItem
                  checked={display[column.key]}
                  className={MENU_ITEM_CLASS}
                  key={column.key}
                  onCheckedChange={(checked) => onChange({ ...display, [column.key]: checked })}
                >
                  <Menu.CheckboxItemIndicator className="col-start-1">
                    <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                  </Menu.CheckboxItemIndicator>
                  <span className="col-start-2">{column.label}</span>
                </Menu.CheckboxItem>
              ))}
            </Menu.Group>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t('review.displayActions')}
              </Menu.GroupLabel>
              <Menu.CheckboxItem
                checked={display.historyAction}
                className={MENU_ITEM_CLASS}
                onCheckedChange={(checked) => onChange({ ...display, historyAction: checked })}
              >
                <Menu.CheckboxItemIndicator className="col-start-1">
                  <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                </Menu.CheckboxItemIndicator>
                <span className="col-start-2">{t('review.showHistoryAction')}</span>
              </Menu.CheckboxItem>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Where the reader is in the list and how to move through it: the range
 * shown, page numbers with gaps, and how many rows a page holds.
 */
export function ReviewPagination({
  onPageChange,
  onPageSizeChange,
  page,
  pageCount,
  pageSize,
  total,
}: {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: ReviewPageSize) => void;
  page: number;
  pageCount: number;
  pageSize: ReviewPageSize;
  total: number;
}) {
  const t = useTranslations('Forms');
  const pageSizeId = useId();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <p aria-live="polite">
          <span
            className="inline-block animate-in duration-300 fade-in motion-reduce:animate-none"
            key={`${from}-${to}-${total}`}
          >
            {t('review.resultCount', { from, to, total })}
          </span>
        </p>
        <span className="flex items-center gap-2">
          <label htmlFor={pageSizeId}>{t('review.pageSizeLabel')}</label>
          <span className="relative">
            <select
              className={cn(SELECT_CLASS, 'h-9 w-20')}
              id={pageSizeId}
              onChange={(event) => {
                const next = REVIEW_PAGE_SIZES.find(
                  (candidate) => String(candidate) === event.target.value,
                );
                if (next !== undefined) onPageSizeChange(next);
              }}
              value={pageSize}
            >
              {REVIEW_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </span>
        </span>
      </div>

      <PageNav
        labels={{
          nav: t('review.paginationLabel'),
          next: t('review.nextPage'),
          page: (item) => t('review.pageLabel', { page: item }),
          previous: t('review.previousPage'),
        }}
        onPageChange={onPageChange}
        page={page}
        pageCount={pageCount}
      />
    </div>
  );
}
