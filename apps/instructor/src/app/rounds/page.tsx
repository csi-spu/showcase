import { Card, CardContent, CardHeader, CardTitle } from '@showcase/ui/card';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('round.pageTitle')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('round.createTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateRoundForm action={createRoundAction} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('round.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('round.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rounds.map((round) => (
                <li key={round.id}>
                  <Link
                    className="flex items-center justify-between rounded-control border border-border/80 bg-card px-4 py-3 text-sm hover:bg-muted"
                    href={`/rounds/${round.id}`}
                  >
                    <span className="font-medium">{round.name}</span>
                    <span className="text-muted-foreground">{formatBangkokDate(round.createdAt)}</span>
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
