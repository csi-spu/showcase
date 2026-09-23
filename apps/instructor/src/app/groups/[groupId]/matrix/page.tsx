import {
  CheckCircle2Icon,
  ClockIcon,
  CircleDashedIcon,
  PencilLineIcon,
  TimerOffIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../../../app-shell';
import { MatrixTable } from './matrix-table';

interface MatrixPageProps {
  params: Promise<{ groupId: string }>;
  /* A repeated query param arrives as an array, so the type admits one. */
  searchParams: Promise<{ after?: string | string[] }>;
}

export default async function GroupMatrixPage({ params, searchParams }: MatrixPageProps) {
  const { groupId } = await params;
  const { after } = await searchParams;
  /* Core validates the cursor as a UUID and rejects anything else. */
  const cursor = typeof after === 'string' ? after : null;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms');
  const groupsClient = new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());
  const formsClient = new InstructorCollectionFormsCoreClient(getInstructorServerEnvironment());

  let detail;
  let page;
  try {
    [detail, page] = await Promise.all([
      groupsClient.getGroup(sessionToken, groupId),
      /* Core bounds the page size, so the view asks for the group and takes what it is given. */
      formsClient.groupMatrix(sessionToken, groupId, { after: cursor }),
    ]);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && error.code === 'GROUP_NOT_FOUND') notFound();
    throw error;
  }

  const groupHref = `/groups/${groupId}`;

  return (
    <AppShell
      trail={[
        { href: `/rounds/${detail.group.roundId}`, label: detail.group.name },
        { href: groupHref, label: t('matrix.backToGroup') },
        { label: t('matrix.pageTitle') },
      ]}
    >
      <PageHeader description={t('matrix.pageDescription')} title={t('matrix.pageTitle')} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={UsersIcon}
          label={t('matrix.statTotalMembers')}
          tone="primary"
          value={page.totalMembers}
        />
        <StatCard
          icon={CheckCircle2Icon}
          label={t('matrix.statPassed')}
          tone="success"
          value={page.summary.passed}
        />
        <StatCard
          icon={ClockIcon}
          label={t('matrix.statAwaitingChecking')}
          tone="information"
          value={page.summary.awaitingChecking}
        />
        <StatCard
          icon={PencilLineIcon}
          label={t('matrix.statChangesRequired')}
          value={page.summary.changesRequired}
        />
        <StatCard
          icon={CircleDashedIcon}
          label={t('matrix.statNotSubmitted')}
          value={page.summary.notSubmitted}
        />
        <StatCard icon={TimerOffIcon} label={t('matrix.statLate')} value={page.summary.late} />
      </div>

      {/*
       * Said plainly, because the totals above describe this page rather than the
       * whole group: a summary that silently means something narrower than it
       * looks is worse than no summary.
       */}
      <p className="text-xs text-muted-foreground">
        {t('matrix.summaryScope', { shown: page.rows.length, total: page.totalMembers })}
      </p>

      {page.forms.length === 0 ? (
        <EmptyState
          description={t('matrix.noFormsDescription')}
          icon={CircleDashedIcon}
          title={t('matrix.noForms')}
        />
      ) : page.rows.length === 0 ? (
        <EmptyState
          description={t('matrix.emptyDescription')}
          icon={UsersIcon}
          title={t('matrix.empty')}
        />
      ) : (
        <MatrixTable page={page} />
      )}

      {/*
       * Forward-only paging: the cursor is the last account id shown, which is
       * all Core needs and all a URL should carry.
       */}
      {page.nextCursor === null ? null : (
        <nav aria-label={t('matrix.pageTitle')} className="flex justify-end">
          <Link
            className="rounded-surface border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none"
            href={`${groupHref}/matrix?after=${page.nextCursor}`}
          >
            {t('matrix.nextPage')}
          </Link>
        </nav>
      )}
    </AppShell>
  );
}
