import { cn } from '@showcase/ui/cn';
import { buttonVariants } from '@showcase/ui/button';
import {
  BellIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  FileTextIcon,
  ListChecksIcon,
  PlusIcon,
  UserRoundXIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DonutChart } from '@/components/ui/donut-chart';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import type {
  InstructorCollectionFormProgress,
  InstructorCollectionOverview,
  InstructorCollectionScope,
  InstructorCollectionUpcomingDeadline,
  InstructorStudentAttentionRow,
} from '@/lib/instructor-collection-overview-core';
import { InstructorCollectionOverviewCoreClient } from '@/lib/instructor-collection-overview-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';
import { ScopeFilters, type ScopeFilter } from './scope-filters';

/** How many follow-up rows the dashboard shows before the dedicated page. */
const ATTENTION_PREVIEW_LIMIT = 5;

type DashboardTranslator = Awaited<ReturnType<typeof getTranslations<'Dashboard'>>>;

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

/*
 * Whole days from now until `value`, in Bangkok terms. Compared date to date
 * rather than instant to instant, so a deadline late tonight reads as "today"
 * and one early tomorrow as "1 day" -- which is how a person reads a calendar.
 */
function daysUntil(value: string): number {
  const toBangkokMidnight = (date: Date): number => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
    }).format(date);
    return Date.parse(`${parts}T00:00:00Z`);
  };
  const dayMs = 86_400_000;
  return Math.round((toBangkokMidnight(new Date(value)) - toBangkokMidnight(new Date())) / dayMs);
}

/* A percentage of a total that may be zero, for the stat-card hints. */
function shareOf(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
}

interface DashboardSearchParams {
  entryYear?: string;
  groupId?: string;
  roundId?: string;
}

/*
 * The scope comes from the URL, so a filtered view is linkable and survives a
 * reload. Anything malformed is dropped rather than forwarded: Core rejects a
 * non-uuid, and a filter the person cannot see in the dropdowns should not
 * silently narrow what they are reading.
 */
function readScope(
  params: DashboardSearchParams,
  options: { entryYears: number[]; groupIds: Set<string>; roundIds: Set<string> },
): InstructorCollectionScope {
  const entryYear = params.entryYear === undefined ? Number.NaN : Number(params.entryYear);
  return {
    ...(options.entryYears.includes(entryYear) ? { entryYear } : {}),
    ...(params.groupId !== undefined && options.groupIds.has(params.groupId)
      ? { groupId: params.groupId }
      : {}),
    ...(params.roundId !== undefined && options.roundIds.has(params.roundId)
      ? { roundId: params.roundId }
      : {}),
  };
}

/**
 * The Instructor landing page.
 *
 * Answers "what needs me today" across every active round at once: the totals,
 * the Students who are behind, the deadlines closing, and how far each open
 * form has got. Before this, every one of those meant opening a round, then a
 * group, and reading a table.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const [t, params] = await Promise.all([getTranslations('Dashboard'), searchParams]);
  const client = new InstructorCollectionOverviewCoreClient(getInstructorServerEnvironment());

  /*
   * The filter options are fetched first because the scope is validated
   * against them: a `roundId` that is not in the dropdown is not a scope the
   * person can undo from the UI, so it is discarded rather than applied.
   */
  const filterOptions = await client.getFilterOptions(sessionToken);
  const scope = readScope(params, {
    entryYears: filterOptions.entryYears,
    groupIds: new Set(filterOptions.groups.map((group) => group.id)),
    roundIds: new Set(filterOptions.rounds.map((round) => round.id)),
  });

  const [overview, attention] = await Promise.all([
    client.getOverview(sessionToken, scope),
    client.getStudentAttention(sessionToken, { ...scope, limit: ATTENTION_PREVIEW_LIMIT }),
  ]);

  const totals = overview.activeRoundTotals;
  /*
   * Only the groups of the selected round, so the two dropdowns compose:
   * picking a round narrows the group list rather than leaving every group in
   * the faculty in it.
   */
  const groupOptions =
    scope.roundId === undefined
      ? filterOptions.groups
      : filterOptions.groups.filter((group) => group.roundId === scope.roundId);

  const filters: ScopeFilter[] = [
    {
      icon: 'calendarRange',
      name: 'roundId',
      options: filterOptions.rounds.map((round) => ({ label: round.name, value: round.id })),
      placeholder: t('filterAllRounds'),
      value: scope.roundId,
    },
    {
      icon: 'users',
      name: 'entryYear',
      options: filterOptions.entryYears.map((year) => ({
        label: t('filterEntryYear', { year }),
        value: String(year),
      })),
      placeholder: t('filterAllEntryYears'),
      value: scope.entryYear === undefined ? undefined : String(scope.entryYear),
    },
    {
      icon: 'layers',
      name: 'groupId',
      options: groupOptions.map((group) => ({ label: group.name, value: group.id })),
      placeholder: t('filterAllGroups'),
      value: scope.groupId,
    },
  ];

  return (
    <AppShell pendingReview={totals.submissionsPendingReview} width="wide">
      <PageHeader
        action={
          <Link className={buttonVariants({ size: 'sm' })} href="/rounds?createForm=1">
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {t('createForm')}
          </Link>
        }
        description={t('pageDescription')}
        title={t('pageTitle')}
      />

      <ScopeFilters filters={filters} label={t('filterLabel')} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint={t('statStudentsHint', { groups: totals.groups })}
          icon={UsersIcon}
          label={t('statStudents')}
          tone="primary"
          value={totals.students}
        />
        <StatCard
          hint={t('statShareOfStudents', {
            percent: shareOf(totals.studentsFullyComplete, totals.studentsWithObligations),
          })}
          icon={CheckCircle2Icon}
          label={t('statFullyComplete')}
          tone="success"
          value={totals.studentsFullyComplete}
        />
        <StatCard
          hint={t('statShareOfStudents', {
            percent: shareOf(
              totals.studentsPartiallyComplete + totals.studentsWithNoSubmission,
              totals.studentsWithObligations,
            ),
          })}
          icon={FileTextIcon}
          label={t('statIncomplete')}
          tone="muted"
          value={totals.studentsPartiallyComplete + totals.studentsWithNoSubmission}
        />
        <StatCard
          icon={ClockIcon}
          label={t('statPendingReview')}
          tone="information"
          value={totals.submissionsPendingReview}
        />
      </div>

      {/* The follow-up table is the working surface, so it takes the wide
          column; the two rails beside it are reference. */}
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <AttentionPanel rows={attention.rows} t={t} />
          <ProgressPanel items={overview.activeFormProgress} t={t} />
        </div>

        <div className="grid min-w-0 gap-4 xl:auto-rows-fr">
          <UpcomingPanel items={overview.upcomingDeadlines} t={t} />
          <CompletionPanel totals={totals} t={t} />
        </div>
      </div>
    </AppShell>
  );
}

/* A titled card with an optional "see all" link, shared by every panel. */
function Panel({
  action,
  children,
  className,
  description,
  icon: Icon,
  title,
}: {
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
  description?: string;
  icon: typeof UsersIcon;
  title: string;
}) {
  return (
    <section
      className={cn(
        'flex h-full min-h-48 flex-col gap-4 rounded-surface border border-border/80 bg-card p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-semibold tracking-tight text-foreground">{title}</h2>
            {description === undefined ? null : (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action === undefined ? null : (
          <Link
            className="group flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
            href={action.href}
          >
            {action.label}
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/*
 * Students with outstanding work. Roster name identifies the row: Core keeps
 * only a keyed hash of the Student ID (ADR 0013), so there is no read path
 * that could put a รหัสนักศึกษา column here. See ADR 0018.
 */
function AttentionPanel({
  rows,
  t,
}: {
  rows: InstructorStudentAttentionRow[];
  t: DashboardTranslator;
}) {
  return (
    <Panel
      action={{ href: '/students', label: t('seeAll') }}
      className="xl:min-h-[22rem]"
      description={t('attentionDescription')}
      icon={ListChecksIcon}
      title={t('attentionTitle')}
    >
      {rows.length === 0 ? (
        <EmptyState
          className="flex-1 justify-center"
          description={t('attentionEmptyDescription')}
          icon={CheckCircle2Icon}
          title={t('attentionEmpty')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={`${row.studentAccountId}-${row.formId}`}>
              <AttentionRow row={row} t={t} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/*
 * Links to the form's submission queue, which is where the row is acted on:
 * the question it raises is "has this arrived", and that page answers it.
 */
function AttentionRow({ row, t }: { row: InstructorStudentAttentionRow; t: DashboardTranslator }) {
  const statusTone = {
    awaiting_checking: 'information',
    changes_required: 'warning',
    not_submitted: 'muted',
  } as const;

  return (
    <Link
      className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-surface border border-border/80 px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 motion-reduce:transition-none"
      href={`/groups/${row.groupId}/forms/${row.formId}/submissions`}
    >
      <span className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">
          {row.firstNameTh} {row.lastNameTh}
        </span>
        <span className="truncate text-sm text-muted-foreground">{row.formTitle}</span>
      </span>
      <StatusBadge tone={statusTone[row.status]}>{t(`status.${row.status}`)}</StatusBadge>
      <span className="w-28 shrink-0 text-sm">
        {row.deadlineAt === null ? (
          <span className="text-muted-foreground">{t('noDeadline')}</span>
        ) : (
          /* Overdue is the one thing on this row that changes what to do
             next, so it is the only value that takes a colour. */
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

function UpcomingPanel({
  items,
  t,
}: {
  items: InstructorCollectionUpcomingDeadline[];
  t: DashboardTranslator;
}) {
  return (
    <Panel description={t('upcomingDescription')} icon={BellIcon} title={t('upcomingTitle')}>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileTextIcon aria-hidden="true" className="size-5" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground">{t('upcomingEmpty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const days = daysUntil(item.deadlineAt);
            return (
              <li className="flex flex-col gap-1.5" key={item.formId}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {item.formTitle}
                  </span>
                  <StatusBadge icon={ClockIcon} tone={days <= 2 ? 'warning' : 'muted'}>
                    {days <= 0 ? t('dueToday') : t('daysLeft', { days })}
                  </StatusBadge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {t('upcomingNotSubmitted', { count: item.studentsNotSubmitted })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('upcomingDue', { date: formatBangkokDate(item.deadlineAt) })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ProgressPanel({
  items,
  t,
}: {
  items: InstructorCollectionFormProgress[];
  t: DashboardTranslator;
}) {
  return (
    <Panel
      action={{ href: '/rounds', label: t('seeAllRounds') }}
      description={t('progressDescription')}
      icon={ClipboardListIcon}
      title={t('progressTitle')}
    >
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ClipboardListIcon aria-hidden="true" className="size-5" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground">{t('progressEmpty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              className="grid gap-3 rounded-control border border-border/70 px-3.5 py-3 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,2fr)_auto] sm:items-center"
              key={item.formId}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  className="truncate text-sm font-medium text-foreground hover:underline"
                  href={`/groups/${item.groupId}/matrix`}
                >
                  {item.formTitle}
                </Link>
                <span className="truncate text-xs text-muted-foreground">
                  {item.deadlineAt === null
                    ? item.groupName
                    : t('progressDue', { date: formatBangkokDate(item.deadlineAt) })}
                </span>
              </div>
              <div className="min-w-0">
                <ProgressBar
                  completed={item.completedStudents}
                  label={item.formTitle}
                  total={item.totalStudents}
                />
              </div>
              <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground sm:min-w-36 sm:justify-end">
                <span className="tabular-nums">
                  {t('progressCount', {
                    completed: item.completedStudents,
                    total: item.totalStudents,
                  })}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {shareOf(item.completedStudents, item.totalStudents)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/*
 * The completion split, over `studentsWithObligations` rather than `students`.
 * Core is explicit that the three buckets partition only the Students who hold
 * an obligation; a current member of a group with no open form yet holds none,
 * so drawing over `students` would leave the ring short of a full circle.
 */
function CompletionPanel({
  totals,
  t,
}: {
  totals: InstructorCollectionOverview['activeRoundTotals'];
  t: DashboardTranslator;
}) {
  return (
    <Panel
      description={t('completionDescription')}
      icon={UserRoundXIcon}
      title={t('completionTitle')}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-2">
        <DonutChart
          centerLabel={t('completionCenter')}
          segments={[
            { label: t('statFullyComplete'), tone: 'success', value: totals.studentsFullyComplete },
            {
              label: t('completionPartial'),
              tone: 'warning',
              value: totals.studentsPartiallyComplete,
            },
            {
              label: t('completionNone'),
              tone: 'muted',
              value: totals.studentsWithNoSubmission,
            },
          ]}
          title={t('completionTitle')}
          total={totals.studentsWithObligations}
        />
        {totals.studentsWithObligations === 0 ? (
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            {t('completionEmpty')}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
