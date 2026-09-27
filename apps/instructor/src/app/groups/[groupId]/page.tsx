import { DownloadIcon, TableIcon, UserCheckIcon, UserXIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@showcase/ui/button';
import { CoreClientError } from '@showcase/core-client';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import type { InstructorGroupMember } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../../app-shell';
import type { WithdrawMemberAction } from '../../collection-groups-state';
import {
  addMembersAction,
  withdrawMemberAction,
  reinstateMemberAction,
} from '../../collection-groups.actions';
import { MEMBER_SELECTION_READS } from '../../member-selection/member-selection-reads';
import { AddMembersPanel } from './add-members-forms';
import { MemberRowActions } from './member-row-actions';
import {
  createCollectionFormAction,
  createCollectionFormFromTemplateAction,
} from '../../collection-forms.actions';
import { FormsSection } from './forms/forms-section';

interface GroupPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Groups');
  const tForms = await getTranslations('Forms');
  const client = new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());
  let detail;
  let rounds;
  try {
    [detail, rounds] = await Promise.all([
      client.getGroup(sessionToken, groupId),
      client.listRounds(sessionToken),
    ]);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && error.code === 'GROUP_NOT_FOUND') {
      notFound();
    }
    throw error;
  }
  const round = rounds.find((r) => r.id === detail.group.roundId);
  const formsClient = new InstructorCollectionFormsCoreClient(getInstructorServerEnvironment());
  const [forms, templates] = await Promise.all([
    formsClient.list(sessionToken, groupId),
    formsClient.listTemplates(sessionToken),
  ]);

  const boundAddMembers = addMembersAction.bind(null, groupId);
  const boundWithdraw = withdrawMemberAction.bind(null, groupId);
  const boundReinstate = reinstateMemberAction.bind(null, groupId);
  const currentMembers = detail.members.filter((member) => member.status === 'current');
  const withdrawnMembers = detail.members.filter((member) => member.status === 'withdrawn');

  return (
    <AppShell
      trail={[
        { href: '/rounds', label: t('round.pageTitle') },
        round
          ? { href: `/rounds/${round.id}`, label: round.name }
          : { href: `/rounds/${detail.group.roundId}`, label: t('round.backToList') },
        { label: detail.group.name },
      ]}
      roundId={detail.group.roundId}
    >
      {/*
       * The two views onto this group sit in the header, where a page's own
       * actions belong. They were a row of bordered links in the middle of the
       * page, which read as content and pushed the roster further down.
       */}
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={`/groups/${groupId}/matrix`}
            >
              <TableIcon aria-hidden="true" data-icon="inline-start" />
              {tForms('matrix.openAction')}
            </Link>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={`/groups/${groupId}/exports`}
            >
              <DownloadIcon aria-hidden="true" data-icon="inline-start" />
              {tForms('exports.openAction')}
            </Link>
          </div>
        }
        description={t('members.pageDescription')}
        title={detail.group.name}
      />

      {/*
       * Forms first. Building and reviewing them is what this page is opened
       * for; the roster is the supporting list, and the counts describe that
       * roster rather than the page, so they travel with it.
       */}
      <FormsSection
        createAction={createCollectionFormAction.bind(null, groupId)}
        createFromTemplateAction={createCollectionFormFromTemplateAction.bind(null, groupId)}
        forms={forms}
        groupId={groupId}
        templates={templates}
      />

      {/*
       * The roster is one region, not three. Its counts, its add control and
       * both of its lists were separate top-level sections, so withdrawing
       * someone appeared to remove them from the page rather than move them
       * within it.
       */}
      <section aria-labelledby="roster-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground" id="roster-heading">
            {t('members.rosterHeading')}
          </h2>
          <AddMembersPanel
            action={boundAddMembers}
            groupId={groupId}
            openFormsCount={forms.filter((form) => form.status === 'open').length}
            reads={MEMBER_SELECTION_READS}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            icon={UserCheckIcon}
            label={t('members.statCurrent')}
            tone="success"
            value={currentMembers.length}
          />
          <StatCard
            icon={UserXIcon}
            label={t('members.statWithdrawn')}
            tone="muted"
            value={withdrawnMembers.length}
          />
        </div>

        <div aria-labelledby="current-members-heading" className="flex flex-col gap-3" role="group">
          <h3 className="text-sm font-semibold text-foreground" id="current-members-heading">
            {t('members.currentTitle')} ({currentMembers.length})
          </h3>
          {currentMembers.length === 0 ? (
            <EmptyState
              description={t('members.emptyDescription')}
              icon={UsersIcon}
              title={t('members.empty')}
            />
          ) : (
            <Table label={t('members.currentTitle')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('members.columnStudentId')}</TableHead>
                  <TableHead>{t('members.columnName')}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t('members.columnEntryYear')}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t('members.columnSource')}
                  </TableHead>
                  <TableHead className="text-right">{t('members.columnActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentMembers.map((member) => (
                  <MemberRow
                    action={boundWithdraw}
                    key={member.studentAccountId}
                    member={member}
                    t={t}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {withdrawnMembers.length === 0 ? null : (
          <div
            aria-labelledby="withdrawn-members-heading"
            className="flex flex-col gap-3"
            role="group"
          >
            <h3
              className="text-sm font-semibold text-muted-foreground"
              id="withdrawn-members-heading"
            >
              {t('members.withdrawnTitle')} ({withdrawnMembers.length})
            </h3>
            <Table label={t('members.withdrawnTitle')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('members.columnStudentId')}</TableHead>
                  <TableHead>{t('members.columnName')}</TableHead>
                  <TableHead>{t('members.columnReason')}</TableHead>
                  <TableHead className="text-right">{t('members.columnActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawnMembers.map((member) => (
                  <TableRow key={member.studentAccountId}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {member.studentId ?? t('members.studentIdMissing')}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <UserXIcon aria-hidden="true" className="size-4" />
                        </span>
                        <span className="truncate text-muted-foreground">
                          {member.firstNameTh} {member.lastNameTh}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.withdrawalReason}
                    </TableCell>
                    <TableCell className="text-right">
                      <MemberRowActions
                        action={boundReinstate}
                        kind="reinstate"
                        memberName={`${member.firstNameTh} ${member.lastNameTh}`}
                        studentAccountId={member.studentAccountId}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function MemberRow({
  action,
  member,
  t,
}: {
  action: WithdrawMemberAction;
  member: InstructorGroupMember;
  t: Awaited<ReturnType<typeof getTranslations<'Groups'>>>;
}) {
  return (
    <TableRow>
      <TableCell className="tabular-nums">
        {member.studentId ?? t('members.studentIdMissing')}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-accent-foreground">
            {member.firstNameTh.charAt(0)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">
              {member.firstNameTh} {member.lastNameTh}
            </span>
            <span className="text-xs text-muted-foreground sm:hidden">
              {t('members.entryYear', { year: member.entryYear })}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
        {member.entryYear}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <StatusBadge tone="muted">{t(`members.source.${member.membershipSource}`)}</StatusBadge>
      </TableCell>
      <TableCell className="text-right">
        <MemberRowActions
          action={action}
          kind="withdraw"
          memberName={`${member.firstNameTh} ${member.lastNameTh}`}
          studentAccountId={member.studentAccountId}
        />
      </TableCell>
    </TableRow>
  );
}
