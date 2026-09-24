import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@showcase/ui/button';
import { CoreClientError } from '@showcase/core-client';
import { PageHeader } from '@/components/ui/page-header';
import { getStudentCollectionAuthPageState } from '@/lib/student-collection-auth-page-state';
import { readStudentCollectionSessionToken } from '@/lib/student-collection-auth-session';
import { StudentCollectionFormsCoreClient } from '@/lib/student-collection-forms-core';
import { getStudentCollectionServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../../app-shell';
import { SubmissionHistory } from './submission-history';

interface HistoryPageProps {
  params: Promise<{ formId: string }>;
}

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { formId } = await params;
  /*
   * A signed-out visit to a deeplink still lands here first, since the page
   * needs a session to fetch anything from Core. The return path is carried
   * on the redirect so "/" can send the Student straight back after login,
   * instead of stranding them on the dashboard.
   */
  const returnTo = `/history/${formId}`;
  const state = await getStudentCollectionAuthPageState(false);
  if (state.kind !== 'active') {
    redirect(
      state.kind === 'expired'
        ? `/?expired=1&returnTo=${encodeURIComponent(returnTo)}`
        : `/?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }
  const sessionToken = await readStudentCollectionSessionToken();
  if (sessionToken === null) {
    redirect(`/?expired=1&returnTo=${encodeURIComponent(returnTo)}`);
  }

  const t = await getTranslations('Forms.history');

  let history;
  try {
    history = await new StudentCollectionFormsCoreClient(
      getStudentCollectionServerEnvironment(),
    ).listHistory(sessionToken, formId);
  } catch (error: unknown) {
    /*
     * Core answers the same way for a form that does not exist and one this
     * Student was never assigned, so this page cannot distinguish them either.
     */
    if (error instanceof CoreClientError && error.code === 'OBLIGATION_NOT_FOUND') notFound();
    throw error;
  }

  return (
    <AppShell>
      <PageHeader
        action={
          <Link className={buttonVariants({ variant: 'outline' })} href="/">
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            {t('backToList')}
          </Link>
        }
        description={t('pageDescription')}
        title={history.form.title}
      />
      <SubmissionHistory history={history} />
    </AppShell>
  );
}
