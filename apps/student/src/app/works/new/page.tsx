import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient, StudentWorksCoreError } from '@/lib/student-works-core';
import { WorkForm } from '../work-form';
import { createWorkAction } from '../work.actions';
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
  const [t, idempotencyKey] = await Promise.all([
    getTranslations('WorkPage'),
    Promise.resolve(randomUUID()),
  ]);

  return (
    <StudentWorkspaceShell activePage="create-work" canCreateWork>
      <div>
        <h1 className="sr-only">{t('createHeading')}</h1>
        <WorkForm
          action={createWorkAction}
          context={context}
          idempotencyKey={idempotencyKey}
          mode="create"
          work={null}
        />
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
