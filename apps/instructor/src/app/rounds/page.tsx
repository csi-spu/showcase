import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@showcase/ui/card';
import { CalendarRangeIcon, ChevronRightIcon, FolderClockIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppHeader } from '../app-header';
import { createRoundAction } from '../collection-groups.actions';
import { CreateRoundForm } from './create-round-form';

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
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

  return (
    <div className="instructor-canvas min-h-svh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            {t('round.pageTitle')}
          </h1>
          <p className="max-w-xl text-muted-foreground">{t('round.pageDescription')}</p>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{t('round.createTitle')}</CardTitle>
            <CardDescription>{t('round.createDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateRoundForm action={createRoundAction} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{t('round.listTitle')}</CardTitle>
            <CardDescription>{t('round.listDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
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
                    <Link
                      className="group flex items-center gap-4 rounded-xl border border-border/80 bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                      href={`/rounds/${round.id}`}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <CalendarRangeIcon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-foreground">{round.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {t('round.createdAt', { date: formatBangkokDate(round.createdAt) })}
                        </span>
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

function EmptyState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof FolderClockIcon;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
