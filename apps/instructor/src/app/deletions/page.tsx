import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionDeletionsCoreClient } from '@/lib/instructor-collection-deletions-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';
import {
  readCollectionDeletionsAction,
  restoreCollectionDeletionAction,
} from '../collection-deletions.actions';
import { DeletionLog } from './deletion-log';

/** "ประวัติการลบ": who deleted which round, group, or form, and the way back. */
export default async function DeletionsPage() {
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const [t, tGroups] = await Promise.all([
    getTranslations('Deletions.log'),
    getTranslations('Groups'),
  ]);
  const client = new InstructorCollectionDeletionsCoreClient(getInstructorServerEnvironment());
  const firstPage = await client.listDeletions(sessionToken, null);

  return (
    <AppShell
      trail={[{ href: '/rounds', label: tGroups('round.pageTitle') }, { label: t('pageTitle') }]}
    >
      <PageHeader description={t('pageDescription')} title={t('pageTitle')} />
      <DeletionLog
        initialPage={firstPage}
        readPage={readCollectionDeletionsAction}
        restoreAction={restoreCollectionDeletionAction}
      />
    </AppShell>
  );
}
