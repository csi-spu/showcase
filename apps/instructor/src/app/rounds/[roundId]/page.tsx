import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  FolderIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../../app-shell';
import {
  closeCollectionRoundAction,
  reopenCollectionRoundAction,
} from '../../collection-forms.actions';
import { createGroupAction } from '../../collection-groups.actions';
import { DeleteItemMenu } from '../../deletions/delete-item-menu';
import { MEMBER_SELECTION_READS } from '../../member-selection/member-selection-reads';
import { CreateGroupPanel } from './create-group-form';
import { RoundLifecyclePanel } from './round-lifecycle-panel';

interface RoundPageProps {
  params: Promise<{ roundId: string }>;
}

export default async function RoundPage({ params }: RoundPageProps) {
  const { roundId } = await params;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Groups');
  const environment = getInstructorServerEnvironment();
  const client = new InstructorCollectionGroupsCoreClient(environment);
  let round;
  let groups;
  try {
    [round, groups] = await Promise.all([
      client
        .listRounds(sessionToken)
        .then((rounds) => rounds.find((r) => r.id === roundId) ?? null),
      client.listGroups(sessionToken, roundId),
    ]);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && error.code === 'ROUND_NOT_FOUND') {
      notFound();
    }
    throw error;
  }
  if (round === null) notFound();
  const boundCreateGroupAction = createGroupAction.bind(null, roundId);
  const isActive = round.status === 'active';

  /*
   * Outstanding work is only asked for when it can change the decision, which
   * is when closing. A failure here leaves the counts out of the confirmation
   * rather than taking the page down.
   */
  const pendingWork = isActive
    ? await new InstructorCollectionFormsCoreClient(environment)
        .roundPendingWork(sessionToken, roundId)
        .catch(() => null)
    : null;

  return (
    <AppShell
      roundId={roundId}
      trail={[{ href: '/rounds', label: t('round.pageTitle') }, { label: round.name }]}
    >
      <PageHeader
        action={
          <DeleteItemMenu
            id={roundId}
            isRoundClosed={!isActive}
            kind="round"
            name={round.name}
            redirectTo="/rounds"
          />
        }
        description={t('group.pageDescription')}
        eyebrow={
          <StatusBadge
            icon={isActive ? CircleDotIcon : CheckCircle2Icon}
            tone={isActive ? 'success' : 'muted'}
          >
            {isActive ? t('round.statusActive') : t('round.statusClosed')}
          </StatusBadge>
        }
        title={round.name}
      />

      <div className="flex flex-wrap items-center gap-2">
        <RoundLifecyclePanel
          closeAction={closeCollectionRoundAction.bind(null, roundId)}
          isActive={isActive}
          pendingWork={pendingWork}
          reopenAction={reopenCollectionRoundAction.bind(null, roundId)}
        />
      </div>

      <CreateGroupPanel action={boundCreateGroupAction} reads={MEMBER_SELECTION_READS} />

      {groups.length === 0 ? (
        <EmptyState
          description={t('group.emptyDescription')}
          icon={FolderIcon}
          title={t('group.empty')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <li className="flex items-center gap-2" key={group.id}>
              <Link
                className="group flex min-w-0 flex-1 items-center gap-4 rounded-surface border border-border/80 bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 motion-reduce:transition-none"
                href={`/groups/${group.id}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-accent-foreground">
                  <UsersIcon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {group.name}
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                />
              </Link>
              <DeleteItemMenu
                id={group.id}
                isRoundClosed={!isActive}
                kind="group"
                name={group.name}
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
