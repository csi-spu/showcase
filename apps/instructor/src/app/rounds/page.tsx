import {
  CalendarRangeIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  FolderClockIcon,
  LayersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import type { InstructorCollectionRound } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';
import { createRoundAction } from '../collection-groups.actions';
import { CreateRoundPanel } from './create-round-form';

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

export default async function RoundsPage() {
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Groups');
  const client = new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());
  const rounds = await client.listRounds(sessionToken);
  const activeCount = rounds.filter((round) => round.status === 'active').length;

  return (
    <AppShell>
      <PageHeader description={t('round.pageDescription')} title={t('round.pageTitle')} />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          icon={LayersIcon}
          label={t('round.statTotal')}
          tone="information"
          value={rounds.length}
        />
        <StatCard
          icon={CircleDotIcon}
          label={t('round.statActive')}
          tone="success"
          value={activeCount}
        />
      </div>

      <CreateRoundPanel action={createRoundAction} />

      {rounds.length === 0 ? (
        <EmptyState
          description={t('round.emptyDescription')}
          icon={FolderClockIcon}
          title={t('round.empty')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rounds.map((round) => (
            <li key={round.id}>
              <RoundRow round={round} t={t} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function RoundRow({
  round,
  t,
}: {
  round: InstructorCollectionRound;
  t: Awaited<ReturnType<typeof getTranslations<'Groups'>>>;
}) {
  const isActive = round.status === 'active';

  return (
    <Link
      className="group flex items-center gap-4 rounded-surface border border-border/80 bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 motion-reduce:transition-none"
      href={`/rounds/${round.id}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-information-background text-information">
        <CalendarRangeIcon aria-hidden="true" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">{round.name}</span>
          <StatusBadge
            icon={isActive ? CircleDotIcon : CheckCircle2Icon}
            tone={isActive ? 'success' : 'muted'}
          >
            {isActive ? t('round.statusActive') : t('round.statusClosed')}
          </StatusBadge>
        </span>
        <span className="text-sm text-muted-foreground">
          {t('round.createdAt', { date: formatBangkokDate(round.createdAt) })}
        </span>
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
      />
    </Link>
  );
}
