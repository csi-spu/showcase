import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { PageHeader } from '@/components/ui/page-header';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '@/app/app-shell';
import { checkCollectionSubmissionAction } from '@/app/collection-forms.actions';
import { ReviewQueue } from './review-queue';

interface SubmissionsPageProps {
  params: Promise<{ formId: string; groupId: string }>;
}

export default async function SubmissionsPage({ params }: SubmissionsPageProps) {
  const { formId, groupId } = await params;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms');
  const groupsT = await getTranslations('Groups');
  const environment = getInstructorServerEnvironment();

  let detail;
  let queue;
  try {
    [detail, queue] = await Promise.all([
      new InstructorCollectionGroupsCoreClient(environment).getGroup(sessionToken, groupId),
      new InstructorCollectionFormsCoreClient(environment).listSubmissions(sessionToken, formId),
    ]);
  } catch (error: unknown) {
    if (
      error instanceof CoreClientError &&
      ['FORM_NOT_FOUND', 'GROUP_NOT_FOUND'].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <AppShell
      trail={[
        { href: '/rounds', label: groupsT('round.pageTitle') },
        { href: `/groups/${groupId}`, label: detail.group.name },
        { href: `/groups/${groupId}/forms/${formId}`, label: queue.form.title },
        { label: t('review.pageTitle') },
      ]}
    >
      <PageHeader description={t('review.pageDescription')} title={queue.form.title} />
      <ReviewQueue
        checkAction={checkCollectionSubmissionAction.bind(null, groupId, formId)}
        entries={queue.entries}
        fields={queue.form.fields}
      />
    </AppShell>
  );
}
