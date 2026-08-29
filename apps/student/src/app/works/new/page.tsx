import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient, StudentWorksCoreError } from '@/lib/student-works-core';
import { WorkForm } from '../work-form';
import { StudentWorkspaceShell } from '../../student-workspace-shell';

export default async function NewWorkPage() {
  const state = await getStudentAuthPageState();
  if (state.kind !== 'active' || !state.session.canUseStudentCapabilities) redirect('/');
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  let context;
  try {
    context = await new StudentWorksCoreClient(getStudentServerEnvironment()).getAuthoringContext(
      sessionToken,
    );
  } catch (error: unknown) {
    handleLoadError(error);
  }
  const t = await getTranslations('WorkPage');

  return (
    <StudentWorkspaceShell activePage="add-work" canCreateWork>
      <div>
        <h1 className="sr-only">{t('createHeading')}</h1>
        <WorkForm context={context} initialWork={null} />
      </div>
    </StudentWorkspaceShell>
  );
}

function handleLoadError(error: unknown): never {
  if (
    error instanceof StudentWorksCoreError &&
    ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  ) {
    redirect('/?expired=1');
  }
  if (error instanceof StudentWorksCoreError && error.code === 'FORBIDDEN') redirect('/');
  throw error;
}
