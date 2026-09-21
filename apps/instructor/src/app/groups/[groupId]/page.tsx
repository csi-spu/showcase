import { Badge } from '@showcase/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@showcase/ui/card';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
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
  try {
    detail = await client.getGroup(sessionToken, groupId);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && error.code === 'GROUP_NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  const boundAddByStudentIds = addMembersByStudentIdsAction.bind(null, groupId);
  const boundAddByEntryYear = addMembersByEntryYearAction.bind(null, groupId);
  const boundWithdraw = withdrawMemberAction.bind(null, groupId);
  const currentMembers = detail.members.filter((member) => member.status === 'current');
  const withdrawnMembers = detail.members.filter((member) => member.status === 'withdrawn');

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{detail.group.name}</h1>
        <Link
          className="text-sm text-primary underline-offset-4 hover:underline"
          href={`/rounds/${detail.group.roundId}`}
        >
          {t('group.backToList')}
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('members.addByIdsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AddByStudentIdsForm action={boundAddByStudentIds} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('members.addByEntryYearTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AddByEntryYearForm action={boundAddByEntryYear} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('members.currentTitle')} ({currentMembers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('members.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {currentMembers.map((member) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border/80 bg-card px-4 py-3 text-sm"
                  key={member.studentAccountId}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {member.firstNameTh} {member.lastNameTh}
                    </span>
                    <Badge variant="secondary">
                      {t(`members.entryYear`, { year: member.entryYear })}
                    </Badge>
                    <Badge variant="outline">
                      {t(`members.source.${member.membershipSource}`)}
                    </Badge>
                  </div>
                  <MemberRowActions
                    action={boundWithdraw}
                    studentAccountId={member.studentAccountId}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {withdrawnMembers.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('members.withdrawnTitle')} ({withdrawnMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {withdrawnMembers.map((member) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border/80 bg-muted px-4 py-3 text-sm text-muted-foreground"
                  key={member.studentAccountId}
                >
                  <span className="font-medium">
                    {member.firstNameTh} {member.lastNameTh}
                  </span>
                  <span>{member.withdrawalReason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
