import { cn } from '@showcase/ui/cn';
import { ArchiveIcon, ClockIcon, FolderClockIcon, LayersIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { FocusTile } from '@/components/ui/focus-tile';
import { NumberTicker } from '@/components/ui/number-ticker';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import type { InstructorCollectionOverview } from '@/lib/instructor-collection-overview-core';
import { InstructorCollectionOverviewCoreClient } from '@/lib/instructor-collection-overview-core';
import { ENTRANCE_CLASS } from '@/lib/motion';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';
import { createCollectionFormAction } from '../collection-forms.actions';
import { createFormGroupAction, createRoundAction } from '../collection-groups.actions';
import { MEMBER_SELECTION_READS } from '../member-selection/member-selection-reads';
import { CreateFormFlow } from './create-form-flow';
import { CreateRoundPanel } from './create-round-form';
import { RoundList } from './round-list';
import type { RoundStatusFilter } from './round-list-view';

type GroupsTranslator = Awaited<ReturnType<typeof getTranslations<'Groups'>>>;

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

function includesValue(value: string | string[] | undefined, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.includes(expected));
}

/* Anything but a known status opens the whole list, rather than an empty one. */
function readStatus(value: string | string[] | undefined): RoundStatusFilter {
  if (includesValue(value, 'active')) return 'active';
  if (includesValue(value, 'closed')) return 'closed';
  return 'all';
}

export default async function RoundsPage({
  searchParams,
}: {
  searchParams: Promise<{ createForm?: string | string[]; status?: string | string[] }>;
}) {
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const [t, query] = await Promise.all([getTranslations('Groups'), searchParams]);
  const environment = getInstructorServerEnvironment();
  const client = new InstructorCollectionGroupsCoreClient(environment);
  const overviewClient = new InstructorCollectionOverviewCoreClient(environment);
  const [rounds, filterOptions, overview] = await Promise.all([
    client.listRounds(sessionToken),
    overviewClient.getFilterOptions(sessionToken),
    overviewClient.getOverview(sessionToken),
  ]);
  const activeRounds = rounds
    .filter((round) => round.status === 'active')
    .map((round) => ({ id: round.id, name: round.name }));
  const activeRoundIds = new Set(activeRounds.map((round) => round.id));
  const activeGroups = filterOptions.groups.filter((group) => activeRoundIds.has(group.roundId));
  const shouldOpenCreateForm = includesValue(query.createForm, '1');
  const initialStatus = readStatus(query.status);

  return (
    <AppShell pendingReview={overview.activeRoundTotals.submissionsPendingReview}>
      <PageHeader
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <CreateRoundPanel action={createRoundAction} />
            <CreateFormFlow
              createFormAction={createCollectionFormAction}
              defaultOpen={shouldOpenCreateForm}
              groups={activeGroups}
              key={shouldOpenCreateForm ? 'create-form-open' : 'create-form-closed'}
              rounds={activeRounds}
              reads={MEMBER_SELECTION_READS}
              setupAction={createFormGroupAction}
            />
          </div>
        }
        description={t('round.pageDescription')}
        title={t('round.pageTitle')}
      />

      {rounds.length === 0 ? (
        <EmptyState
          description={t('round.emptyDescription')}
          icon={FolderClockIcon}
          title={t('round.empty')}
        />
      ) : (
        <>
          <RoundsFocusPanel overview={overview} t={t} />
          <RoundList
            initialStatus={initialStatus}
            // Keyed on the requested status, so following a link to a filtered
            // list resets the list rather than keeping the previous filter.
            key={initialStatus}
            rounds={rounds.map((round) => ({
              createdAt: round.createdAt,
              createdAtLabel: t('round.createdAt', { date: formatBangkokDate(round.createdAt) }),
              id: round.id,
              name: round.name,
              status: round.status,
            }))}
          />
        </>
      )}
    </AppShell>
  );
}

/*
 * The rounds at a glance: how many are open and how far their Students have
 * got, then what is inside them, what is waiting for the Instructor, and the
 * closed rounds, which open the list already filtered to them. The figures
 * are Core's exact totals, not sums over the listed rounds.
 */
function RoundsFocusPanel({
  overview,
  t,
}: {
  overview: InstructorCollectionOverview;
  t: GroupsTranslator;
}) {
  const totals = overview.activeRoundTotals;
  const { active, closed } = overview.roundCounts;

  return (
    <section
      aria-labelledby="rounds-focus-title"
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
        <h2 className="text-sm font-medium text-primary" id="rounds-focus-title">
          {t('round.summaryTitle')}
        </h2>
        <p className="flex flex-col gap-1.5">
          <NumberTicker
            className="text-6xl leading-none font-bold tracking-tight text-primary"
            value={active}
          />
          <span className="text-sm text-muted-foreground">
            {t('round.focusActiveLabel', { total: active + closed })}
          </span>
        </p>
        <ProgressBar
          className="h-2.5"
          completed={totals.studentsFullyComplete}
          label={t('round.focusCompletionLabel')}
          total={totals.studentsWithObligations}
        />
        <p className="text-sm text-muted-foreground">
          {t('round.focusCompletionCount', {
            completed: totals.studentsFullyComplete,
            total: totals.studentsWithObligations,
          })}
        </p>
      </div>

      <ul className="relative grid min-w-0 auto-rows-fr gap-3 sm:grid-cols-3">
        <FocusTile
          delayIndex={1}
          hint={t('round.focusGroupsHint', { count: totals.students })}
          icon={LayersIcon}
          label={t('round.focusGroups')}
          tone="information"
          value={<NumberTicker value={totals.groups} />}
        />
        <FocusTile
          delayIndex={2}
          hint={
            totals.submissionsPendingReview === 0
              ? t('round.focusNoPendingReview')
              : t('round.focusPendingReviewHint')
          }
          href="/students"
          icon={ClockIcon}
          label={t('round.focusPendingReview')}
          tone={totals.submissionsPendingReview === 0 ? 'success' : 'warning'}
          value={<NumberTicker value={totals.submissionsPendingReview} />}
        />
        <FocusTile
          delayIndex={3}
          hint={closed === 0 ? t('round.focusNoClosed') : t('round.focusClosedHint')}
          {...(closed === 0 ? {} : { href: '/rounds?status=closed#round-list' })}
          icon={ArchiveIcon}
          label={t('round.statClosed')}
          tone="primary"
          value={<NumberTicker value={closed} />}
        />
      </ul>
    </section>
  );
}
