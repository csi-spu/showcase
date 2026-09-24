import { buttonVariants } from '@showcase/ui/button';
import { CheckCircle2Icon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import type {
  InstructorCollectionScope,
  InstructorStudentAttentionRow,
} from '@/lib/instructor-collection-overview-core';
import { InstructorCollectionOverviewCoreClient } from '@/lib/instructor-collection-overview-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';
import { ScopeFilters, type ScopeFilter } from '../dashboard/scope-filters';

/** Core's own page size for this read; see MAX_STUDENT_ATTENTION_LIMIT. */
const PAGE_LIMIT = 20;

const STATUS_TONES = {
  awaiting_checking: 'information',
  changes_required: 'warning',
  not_submitted: 'muted',
} as const;

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

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

  const page = await client.getStudentAttention(sessionToken, {
    ...scope,
    ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
    limit: PAGE_LIMIT,
  });

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
   * The cursor is forward-only, so there is a "next" link and no "previous":
   * offering a back link the cursor cannot honour would be worse than not
   * offering one. The filters stay in the link so paging keeps the scope.
   */
  const nextHref = (() => {
    if (page.nextCursor === null) return null;
    const next = new URLSearchParams();
    if (scope.roundId !== undefined) next.set('roundId', scope.roundId);
    if (scope.groupId !== undefined) next.set('groupId', scope.groupId);
    if (scope.entryYear !== undefined) next.set('entryYear', String(scope.entryYear));
    next.set('cursor', page.nextCursor);
    return `/students?${next.toString()}`;
  })();

  return (
    <AppShell width="wide">
      <PageHeader description={t('pageDescription')} title={t('pageTitle')} />

      <ScopeFilters filters={filters} label={tDashboard('filterLabel')} />

      {page.rows.length === 0 ? (
        <EmptyState
          description={t('emptyDescription')}
          icon={CheckCircle2Icon}
          title={t('empty')}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {page.rows.map((row) => (
              <li key={`${row.studentAccountId}-${row.formId}`}>
                <StudentRow row={row} tDashboard={tDashboard} />
              </li>
            ))}
          </ul>
          {nextHref === null ? null : (
            <div className="flex justify-center">
              <Link className={buttonVariants({ variant: 'outline' })} href={nextHref}>
                {t('loadMore')}
              </Link>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function StudentRow({
  row,
  tDashboard,
}: {
  row: InstructorStudentAttentionRow;
  tDashboard: Awaited<ReturnType<typeof getTranslations<'Dashboard'>>>;
}) {
  return (
    <Link
      className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-surface border border-border/80 bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 motion-reduce:transition-none"
      href={`/groups/${row.groupId}/forms/${row.formId}/submissions`}
    >
      <span className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">
          {row.firstNameTh} {row.lastNameTh}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {row.formTitle} · {row.groupName}
        </span>
      </span>
      <StatusBadge tone={STATUS_TONES[row.status]}>
        {tDashboard(`status.${row.status}`)}
      </StatusBadge>
      <span className="w-28 shrink-0 text-sm">
        {row.deadlineAt === null ? (
          <span className="text-muted-foreground">{tDashboard('noDeadline')}</span>
        ) : (
          <span className={row.isLate ? 'font-medium text-destructive' : 'text-muted-foreground'}>
            {formatBangkokDate(row.deadlineAt)}
          </span>
        )}
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
      />
    </Link>
  );
}
