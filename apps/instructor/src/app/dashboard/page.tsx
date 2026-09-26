import { cn } from '@showcase/ui/cn';
import { buttonVariants } from '@showcase/ui/button';
import {
  BellIcon,
  CalendarClockIcon,
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
import { FocusTile } from '@/components/ui/focus-tile';
import { NumberTicker } from '@/components/ui/number-ticker';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
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
import { ENTRANCE_CLASS, staggerDelay, staggerMilliseconds } from '@/lib/motion';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';
import { AttentionRow, formatBangkokDate } from './attention-row';
import { ScopeFilters, type ScopeFilter } from './scope-filters';

/** How many follow-up rows the dashboard shows before the dedicated page. */
const ATTENTION_PREVIEW_LIMIT = 5;
/** A deadline this close is urgent: its tile pulses and turns to warning. */
const URGENT_DEADLINE_DAYS = 2;

type DashboardTranslator = Awaited<ReturnType<typeof getTranslations<'Dashboard'>>>;

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

/* The dashboard's scope as a query string, so a link keeps the same filter. */
function scopeHref(path: string, scope: InstructorCollectionScope): string {
  const query = new URLSearchParams();
  if (scope.roundId !== undefined) query.set('roundId', scope.roundId);
  if (scope.entryYear !== undefined) query.set('entryYear', String(scope.entryYear));
  if (scope.groupId !== undefined) query.set('groupId', scope.groupId);
  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
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

      <FocusPanel
        nextDeadline={nearestDeadline(overview.upcomingDeadlines)}
        studentsHref={scopeHref('/students', scope)}
        t={t}
        totals={totals}
      />

      {/* The follow-up list is the working surface, so it takes the wide
          column; the panels beside it are reference. One grid rather than two
          stacks, so each pair shares a row and their edges line up. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AttentionPanel href={scopeHref('/students', scope)} rows={attention.rows} t={t} />
        <UpcomingPanel items={overview.upcomingDeadlines} t={t} />
        <ProgressPanel items={overview.activeFormProgress} t={t} />
        <CompletionPanel totals={totals} t={t} />
      </div>
    </AppShell>
  );
}

/* The deadline closest to now, which is the one to act on first. */
function nearestDeadline(
  items: InstructorCollectionUpcomingDeadline[],
): InstructorCollectionUpcomingDeadline | undefined {
  return items.reduce<InstructorCollectionUpcomingDeadline | undefined>(
    (nearest, item) =>
      nearest === undefined || Date.parse(item.deadlineAt) < Date.parse(nearest.deadlineAt)
        ? item
        : nearest,
    undefined,
  );
}

/*
 * The first thing on the page: the completion rate as one large number, and
 * beside it the three things that ask something of the Instructor -- work to
 * check, Students still behind, and the next deadline. Each is a large number
 * with its meaning directly under it, so the page is read rather than scanned,
 * and each opens the place where it is acted on.
 */
function FocusPanel({
  nextDeadline,
  studentsHref,
  t,
  totals,
}: {
  nextDeadline: InstructorCollectionUpcomingDeadline | undefined;
  studentsHref: string;
  t: DashboardTranslator;
  totals: InstructorCollectionOverview['activeRoundTotals'];
}) {
  const incomplete = totals.studentsPartiallyComplete + totals.studentsWithNoSubmission;
  const days = nextDeadline === undefined ? null : daysUntil(nextDeadline.deadlineAt);

  return (
    <section
      aria-labelledby="dashboard-focus-title"
      className={cn(
        'relative grid gap-5 overflow-hidden rounded-surface border border-primary/15 bg-card p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:items-stretch',
        ENTRANCE_CLASS,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -left-20 size-80 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex min-w-0 flex-col justify-center gap-3">
        <h2 className="text-sm font-medium text-primary" id="dashboard-focus-title">
          {t('focusEyebrow')}
        </h2>
        <p className="flex flex-col gap-1.5">
          <NumberTicker
            className="text-6xl leading-none font-bold tracking-tight text-primary"
            suffix="%"
            value={shareOf(totals.studentsFullyComplete, totals.studentsWithObligations)}
          />
          <span className="text-sm text-muted-foreground">{t('focusCompletionLabel')}</span>
        </p>
        <ProgressBar
          className="h-2.5"
          completed={totals.studentsFullyComplete}
          label={t('focusCompletionLabel')}
          total={totals.studentsWithObligations}
        />
        <p className="text-sm text-muted-foreground">
          {t('focusCompletionCount', {
            completed: totals.studentsFullyComplete,
            groups: totals.groups,
            students: totals.students,
            total: totals.studentsWithObligations,
          })}
        </p>
      </div>

      <ul className="relative grid min-w-0 auto-rows-fr gap-3 sm:grid-cols-3">
        <FocusTile
          delayIndex={1}
          hint={
            totals.submissionsPendingReview === 0
              ? t('focusNoPendingReview')
              : t('focusPendingReviewHint')
          }
          href={studentsHref}
          icon={ClockIcon}
          label={t('focusPendingReview')}
          tone={totals.submissionsPendingReview === 0 ? 'success' : 'information'}
          value={<NumberTicker value={totals.submissionsPendingReview} />}
        />
        <FocusTile
          delayIndex={2}
          hint={
            incomplete === 0
              ? t('focusAllComplete')
              : t('focusIncompleteHint', { count: totals.studentsWithNoSubmission })
          }
          href={studentsHref}
          icon={UserRoundXIcon}
          label={t('focusIncomplete')}
          tone={incomplete === 0 ? 'success' : 'warning'}
          value={<NumberTicker value={incomplete} />}
        />
        {nextDeadline === undefined || days === null ? (
          <FocusTile
            delayIndex={3}
            hint={t('focusNoDeadline')}
            icon={CalendarClockIcon}
            label={t('focusNextDeadline')}
            tone="primary"
            value="–"
          />
        ) : (
          <FocusTile
            delayIndex={3}
            hint={`${nextDeadline.formTitle} · ${t('upcomingNotSubmitted', {
              count: nextDeadline.studentsNotSubmitted,
            })}`}
            href={`/groups/${nextDeadline.groupId}/forms/${nextDeadline.formId}/submissions`}
            icon={CalendarClockIcon}
            isUrgent={days <= URGENT_DEADLINE_DAYS}
            label={days <= 0 ? t('focusDueTodayLabel') : t('focusNextDeadline')}
            tone={days <= URGENT_DEADLINE_DAYS ? 'warning' : 'primary'}
            value={days <= 0 ? t('focusDueToday') : <NumberTicker value={days} />}
          />
        )}
      </ul>
    </section>
  );
}

/* A titled card with an optional "see all" link, shared by every panel. */
function Panel({
  action,
  children,
  className,
  delayIndex = 0,
  description,
  icon: Icon,
  title,
}: {
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
  /** Its place in the order the panels rise into view. */
  delayIndex?: number;
  description?: string;
  icon: typeof UsersIcon;
  title: string;
}) {
  return (
    <section
      className={cn(
        'group/panel flex min-h-48 flex-col gap-4 rounded-surface border border-border/80 bg-card p-4 transition-[border-color,box-shadow] duration-300 hover:border-primary/25 hover:shadow-md hover:shadow-primary/5 sm:p-5',
        ENTRANCE_CLASS,
        className,
      )}
      style={staggerDelay(delayIndex, 200)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition-transform duration-300 group-hover/panel:scale-110 motion-reduce:transition-none motion-reduce:group-hover/panel:transform-none">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-semibold tracking-tight text-foreground">{title}</h2>
            {description === undefined ? null : (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action === undefined ? null : (
          <Link
            className="group flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary-soft motion-reduce:transition-none"
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
  href,
  rows,
  t,
}: {
  href: string;
  rows: InstructorStudentAttentionRow[];
  t: DashboardTranslator;
}) {
  return (
    <Panel
      action={{ href, label: t('seeAll') }}
      delayIndex={0}
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
          {rows.map((row, index) => (
            <li
              className={ENTRANCE_CLASS}
              key={`${row.studentAccountId}-${row.formId}`}
              style={staggerDelay(index, 300)}
            >
              <AttentionRow row={row} t={t} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/*
 * Each deadline leads with a calendar-style tile of the days left, so the
 * nearest one is read before its title. The row opens that form's queue.
 */
function UpcomingPanel({
  items,
  t,
}: {
  items: InstructorCollectionUpcomingDeadline[];
  t: DashboardTranslator;
}) {
  return (
    <Panel
      delayIndex={1}
      description={t('upcomingDescription')}
      icon={BellIcon}
      title={t('upcomingTitle')}
    >
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileTextIcon aria-hidden="true" className="size-5" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground">{t('upcomingEmpty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => {
            const days = daysUntil(item.deadlineAt);
            const isUrgent = days <= URGENT_DEADLINE_DAYS;
            return (
              <li className={ENTRANCE_CLASS} key={item.formId} style={staggerDelay(index, 350)}>
                <Link
                  className="group flex items-center gap-3 rounded-surface border border-transparent p-2 outline-none transition-[background-color,border-color] duration-200 hover:border-border/80 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
                  href={`/groups/${item.groupId}/forms/${item.formId}/submissions`}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative flex size-14 shrink-0 flex-col items-center justify-center rounded-control transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:transform-none',
                      isUrgent
                        ? 'bg-warning-background text-warning'
                        : 'bg-primary-soft text-primary',
                    )}
                  >
                    {isUrgent ? (
                      <span className="absolute -top-1 -right-1 flex size-2.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-75 motion-reduce:hidden" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-warning" />
                      </span>
                    ) : null}
                    {days <= 0 ? (
                      <span className="text-sm font-semibold">{t('focusDueToday')}</span>
                    ) : (
                      <>
                        <span className="text-xl leading-none font-bold tabular-nums">{days}</span>
                        <span className="text-[0.6875rem]">{t('daysUnit')}</span>
                      </>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-foreground">{item.formTitle}</span>
                    <span className="sr-only">
                      {days <= 0 ? t('dueToday') : t('daysLeft', { days })}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t('upcomingNotSubmitted', { count: item.studentsNotSubmitted })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('upcomingDue', { date: formatBangkokDate(item.deadlineAt) })}
                    </span>
                  </span>
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                  />
                </Link>
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
      delayIndex={2}
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
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li className={ENTRANCE_CLASS} key={item.formId} style={staggerDelay(index, 400)}>
              {/* The whole row opens the group's matrix, where each Student's
                  progress on the form is read. */}
              <Link
                className="group grid gap-3 rounded-control border border-border/70 px-3.5 py-3 outline-none transition-[background-color,border-color,box-shadow] duration-200 hover:border-primary/40 hover:bg-primary-soft/30 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none sm:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,2fr)_auto] sm:items-center"
                href={`/groups/${item.groupId}/matrix`}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {item.formTitle}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.deadlineAt === null
                      ? item.groupName
                      : t('progressDue', { date: formatBangkokDate(item.deadlineAt) })}
                  </span>
                </span>
                <div className="min-w-0">
                  <ProgressBar
                    className="h-2 transition-[height] duration-200 group-hover:h-2.5 motion-reduce:transition-none"
                    completed={item.completedStudents}
                    delayMilliseconds={staggerMilliseconds(index, 500)}
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
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {shareOf(item.completedStudents, item.totalStudents)}%
                  </span>
                </span>
              </Link>
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
      delayIndex={3}
      description={t('completionDescription')}
      icon={UsersIcon}
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
