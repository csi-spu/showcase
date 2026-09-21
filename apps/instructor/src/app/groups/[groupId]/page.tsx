import { Badge } from '@showcase/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@showcase/ui/card';
import { CalendarPlusIcon, IdCardIcon, UsersIcon, UserXIcon } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import type { InstructorGroupMember } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppHeader } from '../../app-header';
import type { WithdrawMemberAction } from '../../collection-groups-state';
import {
  addMembersByEntryYearAction,
  addMembersByStudentIdsAction,
  withdrawMemberAction,
} from '../../collection-groups.actions';
import { AddByEntryYearForm, AddByStudentIdsForm } from './add-members-forms';
import { MemberRowActions } from './member-row-actions';

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

  const boundAddByStudentIds = addMembersByStudentIdsAction.bind(null, groupId);
  const boundAddByEntryYear = addMembersByEntryYearAction.bind(null, groupId);
  const boundWithdraw = withdrawMemberAction.bind(null, groupId);
  const currentMembers = detail.members.filter((member) => member.status === 'current');
  const withdrawnMembers = detail.members.filter((member) => member.status === 'withdrawn');

  return (
    <div className="instructor-canvas min-h-svh">
      <AppHeader
        trail={[
          round
            ? { href: `/rounds/${round.id}`, label: round.name }
            : { href: `/rounds/${detail.group.roundId}`, label: t('round.backToList') },
          { label: detail.group.name },
        ]}
      />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            {detail.group.name}
          </h1>
          <p className="max-w-xl text-muted-foreground">
            {t('members.pageDescription', { count: currentMembers.length })}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IdCardIcon aria-hidden="true" className="size-4 text-primary" />
                {t('members.addByIdsTitle')}
              </CardTitle>
              <CardDescription>{t('members.addByIdsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <AddByStudentIdsForm action={boundAddByStudentIds} />
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarPlusIcon aria-hidden="true" className="size-4 text-primary" />
                {t('members.addByEntryYearTitle')}
              </CardTitle>
              <CardDescription>{t('members.addByEntryYearDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <AddByEntryYearForm action={boundAddByEntryYear} />
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>
              {t('members.currentTitle')} ({currentMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentMembers.length === 0 ? (
              <EmptyState description={t('members.emptyDescription')} title={t('members.empty')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {currentMembers.map((member) => (
                  <MemberRow
                    action={boundWithdraw}
                    key={member.studentAccountId}
                    member={member}
                    t={t}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {withdrawnMembers.length === 0 ? null : (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-muted-foreground">
                {t('members.withdrawnTitle')} ({withdrawnMembers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {withdrawnMembers.map((member) => (
                  <li
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/60 px-4 py-3 text-sm"
                    key={member.studentAccountId}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserXIcon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-muted-foreground line-through decoration-border">
                        {member.firstNameTh} {member.lastNameTh}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {member.withdrawalReason}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
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
  const initial = member.firstNameTh.charAt(0);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
          {initial}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {member.firstNameTh} {member.lastNameTh}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="rounded-full" variant="secondary">
              {t('members.entryYear', { year: member.entryYear })}
            </Badge>
            <Badge className="rounded-full" variant="outline">
              {t(`members.source.${member.membershipSource}`)}
            </Badge>
          </div>
        </div>
      </div>
      <MemberRowActions action={action} studentAccountId={member.studentAccountId} />
    </li>
  );
}

function EmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UsersIcon aria-hidden="true" className="size-5" />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
