import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@showcase/ui/card';
import { ChevronRightIcon, FolderIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppHeader } from '../../app-header';
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

  return (
    <div className="instructor-canvas min-h-svh">
      <AppHeader trail={[{ label: round.name }]} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            {round.name}
          </h1>
          <p className="max-w-xl text-muted-foreground">{t('group.pageDescription')}</p>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{t('group.createTitle')}</CardTitle>
            <CardDescription>{t('group.createDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateGroupForm action={boundCreateGroupAction} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{t('group.listTitle')}</CardTitle>
            <CardDescription>{t('group.listDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <EmptyState description={t('group.emptyDescription')} title={t('group.empty')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      className="group flex items-center gap-4 rounded-xl border border-border/80 bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                      href={`/groups/${group.id}`}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <UsersIcon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {group.name}
                      </span>
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function EmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FolderIcon aria-hidden="true" className="size-5" />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
