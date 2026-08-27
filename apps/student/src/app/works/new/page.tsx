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
      <div className="grid gap-10 lg:grid-cols-12">
        <header className="grid content-start gap-4 lg:col-span-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">WORK DRAFT</p>
          <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
            {t('createHeading')}
          </h1>
          <p className="text-muted-foreground">{t('createDescription')}</p>
        </header>
        <div className="lg:col-span-8">
          <WorkForm
            action={createWorkAction}
            context={context}
            idempotencyKey={idempotencyKey}
            mode="create"
            work={null}
          />
        </div>
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
