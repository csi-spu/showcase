'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowDownUpIcon, FilterIcon, LoaderCircleIcon, SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type WorkListCategory = 'academic_article' | 'all' | 'competition_entry' | 'course_work';
export type WorkListSort = 'updated_asc' | 'updated_desc';
export type WorkListStatus = 'all' | 'changes_requested' | 'draft' | 'pending_review' | 'published';

interface WorkListControlValue {
  category: WorkListCategory;
  page: number;
  query: string;
  sort: WorkListSort;
  status: WorkListStatus;
  view: 'current' | 'saved';
}

interface WorkListControlLabels {
  category: string;
  categoryAll: string;
  categoryAcademicArticle: string;
  categoryCompetitionEntry: string;
  categoryCourseWork: string;
  search: string;
  searchPlaceholder: string;
  sort: string;
  sortNewest: string;
  sortOldest: string;
  status: string;
  statusAll: string;
  statusChangesRequested: string;
  statusDraft: string;
  statusPendingReview: string;
  statusPublished: string;
}

export function WorkListControls({
  labels,
  value,
}: {
  labels: WorkListControlLabels;
  value: WorkListControlValue;
}) {
  const router = useRouter();
  const [localQuery, setLocalQuery] = useState(value.query);
  const [isPending, startTransition] = useTransition();
  const submittedQuery = useRef<string | null>(null);
  const categoryItems: Record<WorkListCategory, string> = {
    academic_article: labels.categoryAcademicArticle,
    all: labels.categoryAll,
    competition_entry: labels.categoryCompetitionEntry,
    course_work: labels.categoryCourseWork,
  };
  const statusItems: Record<WorkListStatus, string> = {
    all: labels.statusAll,
    changes_requested: labels.statusChangesRequested,
    draft: labels.statusDraft,
    pending_review: labels.statusPendingReview,
    published: labels.statusPublished,
  };
  const sortItems: Record<WorkListSort, string> = {
    updated_asc: labels.sortOldest,
    updated_desc: labels.sortNewest,
  };

  useEffect(() => {
    if (submittedQuery.current === value.query) {
      submittedQuery.current = null;
      return;
    }
    setLocalQuery(value.query);
  }, [value.query]);

  useEffect(() => {
    const normalizedQuery = localQuery.trim();
    if (normalizedQuery === value.query) return;
    const timeout = window.setTimeout(() => {
      submittedQuery.current = normalizedQuery;
      startTransition(() =>
        router.replace(buildHref(value, { query: localQuery }), { scroll: false }),
      );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [localQuery, router, value]);

  const update = (patch: Partial<Pick<WorkListControlValue, 'category' | 'sort' | 'status'>>) =>
    startTransition(() =>
      router.replace(buildHref({ ...value, query: localQuery }, patch), { scroll: false }),
    );

  return (
    <div className="grid gap-3 rounded-surface border border-border/80 bg-card p-3 shadow-sm lg:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(10rem,auto))]">
      <label className="relative block">
        <span className="sr-only">{labels.search}</span>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={labels.search}
          className="pr-10 pl-9"
          maxLength={100}
          onChange={(event) => setLocalQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          type="search"
          value={localQuery}
        />
        {isPending ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-primary motion-reduce:animate-none"
          />
        ) : null}
      </label>

      <Select
        items={categoryItems}
        onValueChange={(next) => update({ category: next as WorkListCategory })}
        value={value.category}
      >
        <SelectTrigger aria-label={labels.category} className="w-full">
          <FilterIcon aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{categoryItems.all}</SelectItem>
          <SelectItem value="course_work">{categoryItems.course_work}</SelectItem>
          <SelectItem value="competition_entry">{categoryItems.competition_entry}</SelectItem>
          <SelectItem value="academic_article">{categoryItems.academic_article}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        items={statusItems}
        onValueChange={(next) => update({ status: next as WorkListStatus })}
        value={value.status}
      >
        <SelectTrigger aria-label={labels.status} className="w-full">
          <FilterIcon aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{statusItems.all}</SelectItem>
          <SelectItem value="draft">{statusItems.draft}</SelectItem>
          <SelectItem value="pending_review">{statusItems.pending_review}</SelectItem>
          <SelectItem value="changes_requested">{statusItems.changes_requested}</SelectItem>
          <SelectItem value="published">{statusItems.published}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        items={sortItems}
        onValueChange={(next) => update({ sort: next as WorkListSort })}
        value={value.sort}
      >
        <SelectTrigger aria-label={labels.sort} className="w-full">
          <ArrowDownUpIcon aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="updated_desc">{sortItems.updated_desc}</SelectItem>
          <SelectItem value="updated_asc">{sortItems.updated_asc}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function buildHref(
  value: WorkListControlValue,
  patch: Partial<Pick<WorkListControlValue, 'category' | 'query' | 'sort' | 'status'>>,
): string {
  const next = { ...value, ...patch };
  const params = new URLSearchParams({ view: next.view });
  const query = next.query.trim();
  if (query !== '') params.set('query', query);
  if (next.category !== 'all') params.set('category', next.category);
  if (next.status !== 'all') params.set('status', next.status);
  if (next.sort !== 'updated_desc') params.set('sort', next.sort);
  return `/works?${params.toString()}`;
}
