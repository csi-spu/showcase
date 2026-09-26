import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { CheckCircle2Icon, ChevronRightIcon, ChevronsLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberTicker } from '@/components/ui/number-ticker';
import { PageHeader } from '@/components/ui/page-header';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import type { InstructorCollectionScope } from '@/lib/instructor-collection-overview-core';
import { InstructorCollectionOverviewCoreClient } from '@/lib/instructor-collection-overview-core';
import { ENTRANCE_CLASS, staggerDelay } from '@/lib/motion';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';
import { AttentionRow } from '../dashboard/attention-row';
import { ScopeFilters, type ScopeFilter } from '../dashboard/scope-filters';

/** Core's own page size for this read; see MAX_STUDENT_ATTENTION_LIMIT. */
const PAGE_LIMIT = 20;

interface StudentsSearchParams {
  cursor?: string;
  entryYear?: string;
  groupId?: string;
  roundId?: string;
}

/**
 * Every Student with outstanding work, across the selected scope.
 *
 * The dashboard shows the first few rows of this list; this page is where the
 * whole of it is walked. Rows carry the Roster name rather than a Student ID:
 * Core keeps only a keyed hash of that (ADR 0013), so no read path can produce
 * one. See ADR 0018.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<StudentsSearchParams>;
}) {
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const [t, params] = await Promise.all([getTranslations('Students'), searchParams]);
  const client = new InstructorCollectionOverviewCoreClient(getInstructorServerEnvironment());

  const filterOptions = await client.getFilterOptions(sessionToken);
  const entryYear = params.entryYear === undefined ? Number.NaN : Number(params.entryYear);
  const groupIds = new Set(filterOptions.groups.map((group) => group.id));
  const roundIds = new Set(filterOptions.rounds.map((round) => round.id));

  /* A filter the dropdowns cannot show is a filter the reader cannot undo, so
     anything not in the options is dropped rather than sent to Core. */
  const scope: InstructorCollectionScope = {
    ...(filterOptions.entryYears.includes(entryYear) ? { entryYear } : {}),
    ...(params.groupId !== undefined && groupIds.has(params.groupId)
      ? { groupId: params.groupId }
      : {}),
    ...(params.roundId !== undefined && roundIds.has(params.roundId)
      ? { roundId: params.roundId }
      : {}),
  };

  const [page, overview] = await Promise.all([
    client.getStudentAttention(sessionToken, {
      ...scope,
      ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
      limit: PAGE_LIMIT,
    }),
    client.getOverview(sessionToken, scope),
  ]);

  const groupOptions =
    scope.roundId === undefined
      ? filterOptions.groups
      : filterOptions.groups.filter((group) => group.roundId === scope.roundId);

  const tDashboard = await getTranslations('Dashboard');
  const filters: ScopeFilter[] = [
    {
      icon: 'calendarRange',
      name: 'roundId',
      options: filterOptions.rounds.map((round) => ({ label: round.name, value: round.id })),
      placeholder: tDashboard('filterAllRounds'),
      value: scope.roundId,
    },
    {
      icon: 'users',
      name: 'entryYear',
      options: filterOptions.entryYears.map((year) => ({
        label: tDashboard('filterEntryYear', { year }),
        value: String(year),
      })),
      placeholder: tDashboard('filterAllEntryYears'),
      value: scope.entryYear === undefined ? undefined : String(scope.entryYear),
    },
    {
      icon: 'layers',
      name: 'groupId',
      options: groupOptions.map((group) => ({ label: group.name, value: group.id })),
      placeholder: tDashboard('filterAllGroups'),
      value: scope.groupId,
    },
  ];

  /*
   * The cursor is forward-only, so there is a "next" link and a way back to
   * the start, but no "previous": offering a back link the cursor cannot
   * honour would be worse than not offering one. The filters stay in both
   * links so paging keeps the scope.
   */
  const scopeParams = new URLSearchParams();
  if (scope.roundId !== undefined) scopeParams.set('roundId', scope.roundId);
  if (scope.groupId !== undefined) scopeParams.set('groupId', scope.groupId);
  if (scope.entryYear !== undefined) scopeParams.set('entryYear', String(scope.entryYear));
  const firstHref = scopeParams.size === 0 ? '/students' : `/students?${scopeParams.toString()}`;
  const nextHref = (() => {
    if (page.nextCursor === null) return null;
    const next = new URLSearchParams(scopeParams);
    next.set('cursor', page.nextCursor);
    return `/students?${next.toString()}`;
  })();
  const isFirstPage = params.cursor === undefined;
  const totals = overview.activeRoundTotals;

  return (
    <AppShell pendingReview={totals.submissionsPendingReview} width="wide">
      <PageHeader description={t('pageDescription')} title={t('pageTitle')} />

      <ScopeFilters filters={filters} label={tDashboard('filterLabel')} />

      <section aria-label={t('summaryLabel')} className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          delayIndex={0}
          dotClass="bg-information"
          label={t('summaryPendingReview')}
          unit={t('unitSubmissions')}
          value={totals.submissionsPendingReview}
        />
        <SummaryTile
          delayIndex={1}
          dotClass="bg-warning"
          label={t('summaryPartial')}
          unit={t('unitStudents')}
          value={totals.studentsPartiallyComplete}
        />
        <SummaryTile
          delayIndex={2}
          dotClass="bg-muted-foreground/50"
          label={t('summaryNone')}
          unit={t('unitStudents')}
          value={totals.studentsWithNoSubmission}
        />
      </section>

      {page.rows.length === 0 ? (
        <EmptyState
          description={t('emptyDescription')}
          icon={CheckCircle2Icon}
          title={t('empty')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* The row accents are colour; this says what each one means. */}
          <ul
            aria-label={t('legendLabel')}
            className={cn(
              'flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground',
              ENTRANCE_CLASS,
            )}
            style={staggerDelay(3)}
          >
            {LEGEND.map((item) => (
              <li className="flex items-center gap-1.5" key={item.key}>
                <span aria-hidden="true" className={cn('h-3 w-1 rounded-full', item.className)} />
                {item.key === 'late' ? tDashboard('overdue') : tDashboard(`status.${item.key}`)}
              </li>
            ))}
          </ul>

          <ul className="flex flex-col gap-2">
            {page.rows.map((row, index) => (
              <li
                className={ENTRANCE_CLASS}
                key={`${row.studentAccountId}-${row.formId}`}
                style={staggerDelay(index, 240)}
              >
                <AttentionRow row={row} t={tDashboard} />
              </li>
            ))}
          </ul>

          {isFirstPage && nextHref === null ? null : (
            <nav
              aria-label={t('paginationLabel')}
              className="flex flex-wrap items-center justify-between gap-2 pt-1"
            >
              {isFirstPage ? (
                <span />
              ) : (
                <Link className={buttonVariants({ variant: 'ghost' })} href={firstHref}>
                  <ChevronsLeftIcon aria-hidden="true" data-icon="inline-start" />
                  {t('firstPage')}
                </Link>
              )}
              {nextHref === null ? null : (
                <Link
                  className={cn(buttonVariants({ variant: 'outline' }), 'group')}
                  href={nextHref}
                >
                  {t('loadMore')}
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    data-icon="inline-end"
                  />
                </Link>
              )}
            </nav>
          )}
        </div>
      )}
    </AppShell>
  );
}

const LEGEND = [
  { className: 'bg-information', key: 'awaiting_checking' },
  { className: 'bg-warning', key: 'changes_required' },
  { className: 'bg-muted-foreground/40', key: 'not_submitted' },
  { className: 'bg-destructive', key: 'late' },
] as const;

/* One count across the whole scope, not just this page of rows. */
function SummaryTile({
  delayIndex,
  dotClass,
  label,
  unit,
  value,
}: {
  delayIndex: number;
  dotClass: string;
  label: string;
  unit: string;
  value: number;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-surface border border-border/80 bg-card px-4 py-3 transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-sm motion-reduce:transition-none',
        ENTRANCE_CLASS,
      )}
      style={staggerDelay(delayIndex, 80)}
    >
      <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', dotClass)} />
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1">
        <NumberTicker className="text-2xl font-semibold text-foreground" value={value} />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}
