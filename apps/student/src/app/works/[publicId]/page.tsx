import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient, StudentWorksCoreError } from '@/lib/student-works-core';
import { StudentWorkspaceShell } from '../../student-workspace-shell';
import { WorkspacePage } from '../../workspace-page';
import { WorkForm } from '../work-form';
import { WorkPublishedRevisionPanel, WorkRevisionPendingPanel } from '../work-revision-panel';
import { seedPublishedWorkDraftAction, withdrawWorkRevisionAction } from '../work.actions';

export default async function EditWorkPage({ params }: { params: Promise<{ publicId: string }> }) {
  const parsed = z.uuid().safeParse((await params).publicId);
  if (!parsed.success) notFound();
  const auth = await getStudentAuthPageState();
  if (auth.kind !== 'active') redirect('/?expired=1');
  const token = await readStudentSessionToken();
  if (token === null) redirect('/?expired=1');
  const client = new StudentWorksCoreClient(getStudentServerEnvironment());
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(client, token, parsed.data);
  } catch (error: unknown) {
    handleLoadError(error);
  }
  const t = await getTranslations('WorkPage');
  const canMutate = auth.session.canUseStudentCapabilities;

  return (
    <StudentWorkspaceShell activePage="works" canCreateWork={canMutate}>
      <WorkspacePage
        description={
          state.kind === 'draft'
            ? t('editDescription')
            : state.kind === 'pending'
              ? t('pendingDescription')
              : state.kind === 'published'
                ? t('publishedDescription')
                : t('archivedDescription')
        }
        eyebrow={
          state.kind === 'draft'
            ? 'ฉบับร่างส่วนตัว'
            : state.kind === 'pending'
              ? 'กำลังรอตรวจ'
              : state.kind === 'published'
                ? 'ฉบับที่เผยแพร่แล้ว'
                : 'ผลงานที่บันทึกไว้'
        }
        layout={state.kind === 'draft' ? 'authoring' : 'overview'}
        title={
          state.kind === 'draft'
            ? t('editHeading')
            : state.kind === 'pending'
              ? t('pendingHeading')
              : state.kind === 'published'
                ? t('publishedHeading')
                : t('archivedHeading')
        }
      >
        {!canMutate ? (
          <p className="rounded-surface border bg-muted p-5">{t('readOnly')}</p>
        ) : state.kind === 'draft' ? (
          <WorkForm context={state.context} initialWork={state.work} />
        ) : state.kind === 'pending' ? (
          <WorkRevisionPendingPanel
            action={withdrawWorkRevisionAction.bind(null, parsed.data, state.revision.publicId)}
            idempotencyKey={randomUUID()}
            revision={state.revision}
          />
        ) : state.kind === 'published' ? (
          <WorkPublishedRevisionPanel
            action={seedPublishedWorkDraftAction.bind(null, parsed.data)}
            idempotencyKey={randomUUID()}
            publicationState={state.publicationState}
            publishedRevisionId={state.publishedRevisionId}
          />
        ) : (
          <p>{t('archivedHelp')}</p>
        )}
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}

async function loadState(client: StudentWorksCoreClient, token: string, publicId: string) {
  const recovery = await client.getRecoveryState(token, publicId);
  if (recovery.activityState === 'archived') return { kind: 'archived' as const };
  const pending = await client.getPendingRevision(token, publicId);
  if (pending !== null) return { kind: 'pending' as const, revision: pending };
  const authoring = await client.getAuthoringState(token, publicId);
  if (authoring.draft !== null)
    return {
      context: await client.getAuthoringContext(token),
      kind: 'draft' as const,
      work: authoring.draft,
    };
  if (authoring.publishedRevisionId === null) throw new Error('WORK_AUTHORING_STATE_INVARIANT');
  return {
    kind: 'published' as const,
    publicationState:
      recovery.publicationState === 'published' ? ('published' as const) : ('unpublished' as const),
    publishedRevisionId: authoring.publishedRevisionId,
  };
}

function handleLoadError(error: unknown): never {
  if (
    error instanceof StudentWorksCoreError &&
    ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  )
    redirect('/?expired=1');
  if (error instanceof StudentWorksCoreError && error.code === 'WORK_NOT_FOUND') notFound();
  throw error;
}
