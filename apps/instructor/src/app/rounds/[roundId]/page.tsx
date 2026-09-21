import { Card, CardContent, CardHeader, CardTitle } from '@showcase/ui/card';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { createGroupAction } from '../../collection-groups.actions';
import { CreateGroupForm } from './create-group-form';

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
  const client = new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());
  let groups;
  try {
    groups = await client.listGroups(sessionToken, roundId);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && error.code === 'ROUND_NOT_FOUND') {
      notFound();
    }
    throw error;
  }
  const boundCreateGroupAction = createGroupAction.bind(null, roundId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('group.pageTitle')}</h1>
        <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/rounds">
          {t('round.backToList')}
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('group.createTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateGroupForm action={boundCreateGroupAction} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('group.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('group.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    className="flex items-center justify-between rounded-control border border-border/80 bg-card px-4 py-3 text-sm hover:bg-muted"
                    href={`/groups/${group.id}`}
                  >
                    <span className="font-medium">{group.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
