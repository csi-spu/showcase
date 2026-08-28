import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient, StudentWorksCoreError } from '@/lib/student-works-core';
import { WorkForm } from '../work-form';
import {
  WorkChangeRequestPanel,
  WorkPublishedRevisionPanel,
  WorkRevisionRebasePanel,
  WorkRevisionPendingPanel,
  WorkRevisionSubmissionPanel,
} from '../work-revision-panel';
import {
  cancelWorkRemovalRequestAction,
  createWorkRemovalRequestAction,
  rebaseWorkDraftAction,
  seedPublishedWorkDraftAction,
  submitWorkRevisionAction,
  updateWorkAction,
  withdrawWorkRevisionAction,
} from '../work.actions';
import { ContributorInvitationsPanel } from './contributor-invitations-panel';
import { WorkRemovalPanel } from '../work-removal-panel';
import { StudentWorkspaceShell } from '../../student-workspace-shell';
import { WorkspacePage } from '../../workspace-page';

export default async function EditWorkPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId: rawPublicId } = await params;
  const parsedPublicId = z.uuid().safeParse(rawPublicId);
  if (!parsedPublicId.success) notFound();
  const state = await getStudentAuthPageState();
  if (state.kind !== 'active' || !state.session.canUseStudentCapabilities) redirect('/');
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const client = new StudentWorksCoreClient(getStudentServerEnvironment());
  let revisionState:
    | { kind: 'archived' }
    | {
        context: Awaited<ReturnType<StudentWorksCoreClient['getAuthoringContext']>>;
        invitations: Awaited<ReturnType<StudentWorksCoreClient['listWorkInvitations']>>;
        kind: 'draft';
        review: Awaited<ReturnType<StudentWorksCoreClient['getLatestChangeRequest']>> | null;
        work: Awaited<ReturnType<StudentWorksCoreClient['getWork']>>;
      }
    | {
        kind: 'published';
        publishedRevisionId: string;
      }
    | {
        kind: 'pending';
        revision: NonNullable<Awaited<ReturnType<StudentWorksCoreClient['getPendingRevision']>>>;
      };
  let recoveryState: Awaited<ReturnType<StudentWorksCoreClient['getRecoveryState']>>;
  let removalRequest: Awaited<ReturnType<StudentWorksCoreClient['getPendingRemovalRequest']>>;
  try {
    [recoveryState, removalRequest] = await Promise.all([
      client.getRecoveryState(sessionToken, parsedPublicId.data),
      client.getPendingRemovalRequest(sessionToken, parsedPublicId.data),
    ]);
    const pendingRevision =
      recoveryState.activityState === 'active'
        ? await client.getPendingRevision(sessionToken, parsedPublicId.data)
        : null;
    if (recoveryState.activityState === 'archived') {
      revisionState = { kind: 'archived' };
    } else if (pendingRevision !== null) {
      revisionState = { kind: 'pending', revision: pendingRevision };
    } else {
      const authoringState = await client.getAuthoringState(sessionToken, parsedPublicId.data);
      if (authoringState.draft === null) {
        if (
          authoringState.publicationState === 'never_published' ||
          authoringState.publishedRevisionId === null
        ) {
          throw new Error('WORK_AUTHORING_STATE_INVARIANT');
        }
        revisionState = {
          kind: 'published',
          publishedRevisionId: authoringState.publishedRevisionId,
        };
      } else {
        const [context, invitations, review] = await Promise.all([
          client.getAuthoringContext(sessionToken),
          client.listWorkInvitations(sessionToken, parsedPublicId.data),
          loadChangeRequest(client, sessionToken, parsedPublicId.data),
        ]);
        revisionState = {
          context,
          invitations,
          kind: 'draft',
          review,
          work: authoringState.draft,
        };
      }
    }
  } catch (error: unknown) {
    handleLoadError(error);
  }
  const [t, draftIdempotencyKey, revisionIdempotencyKey, removalIdempotencyKey] = await Promise.all(
    [
      getTranslations('WorkPage'),
      Promise.resolve(randomUUID()),
      Promise.resolve(randomUUID()),
      Promise.resolve(randomUUID()),
    ],
  );
  const updateAction = updateWorkAction.bind(null, parsedPublicId.data);
  const isDraftStale =
    revisionState.kind === 'draft' &&
    revisionState.work.basePublishedRevisionId !== revisionState.work.publishedRevisionId;

  return (
    <StudentWorkspaceShell activePage="work" canCreateWork>
      <WorkspacePage
        description={
          revisionState.kind === 'archived'
            ? t('archivedDescription')
            : revisionState.kind === 'draft'
              ? isDraftStale
                ? t('staleDescription')
                : t('editDescription')
              : revisionState.kind === 'pending'
                ? t('pendingDescription')
                : t('publishedDescription')
        }
        eyebrow={
          revisionState.kind === 'archived'
            ? 'ผลงานที่เก็บถาวร'
            : revisionState.kind === 'draft'
              ? isDraftStale
                ? 'ฉบับร่างที่ต้องอัปเดต'
                : 'ฉบับร่างส่วนตัว'
              : revisionState.kind === 'pending'
                ? 'กำลังรอตรวจ'
                : 'ฉบับที่เผยแพร่แล้ว'
        }
        layout={revisionState.kind === 'draft' ? 'authoring' : 'overview'}
        meta={
          revisionState.kind === 'archived'
            ? t('recoveryVersion', { version: recoveryState.version })
            : revisionState.kind === 'draft'
              ? t('version', { version: revisionState.work.version })
              : revisionState.kind === 'pending'
                ? t('revision', { number: revisionState.revision.number })
                : undefined
        }
        title={
          revisionState.kind === 'archived'
            ? t('archivedHeading')
            : revisionState.kind === 'draft'
              ? t('editHeading')
              : revisionState.kind === 'pending'
                ? t('pendingHeading')
                : t('publishedHeading')
        }
      >
        <div className="grid gap-8">
          {revisionState.kind === 'archived' ? (
            <section className="grid gap-3 rounded-surface border border-warning/30 bg-warning-background p-6 sm:p-8">
              <h2 className="text-2xl font-semibold">{t('archivedHeading')}</h2>
              <p className="text-muted-foreground">{t('archivedHelp')}</p>
            </section>
          ) : revisionState.kind === 'draft' ? (
            <>
              {isDraftStale && revisionState.work.publishedRevisionId !== null ? (
                <WorkRevisionRebasePanel
                  action={rebaseWorkDraftAction.bind(null, parsedPublicId.data)}
                  draftVersion={revisionState.work.version}
                  idempotencyKey={revisionIdempotencyKey}
                  publishedRevisionId={revisionState.work.publishedRevisionId}
                />
              ) : null}
              {revisionState.review === null ? null : (
                <>
                  <WorkChangeRequestPanel review={revisionState.review} />
                  <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
                    {t('changeRequestHelp')}
                  </p>
                </>
              )}
              <WorkForm
                action={updateAction}
                context={revisionState.context}
                idempotencyKey={draftIdempotencyKey}
                mode="edit"
                publicId={parsedPublicId.data}
                work={revisionState.work}
              />
              <ContributorInvitationsPanel
                invitations={revisionState.invitations.items}
                publicId={parsedPublicId.data}
              />
              {isDraftStale ? null : (
                <WorkRevisionSubmissionPanel
                  action={submitWorkRevisionAction.bind(null, parsedPublicId.data)}
                  basePublishedRevisionId={revisionState.work.basePublishedRevisionId}
                  draftVersion={revisionState.work.version}
                  idempotencyKey={revisionIdempotencyKey}
                />
              )}
            </>
          ) : revisionState.kind === 'pending' ? (
            <WorkRevisionPendingPanel
              action={withdrawWorkRevisionAction.bind(
                null,
                parsedPublicId.data,
                revisionState.revision.publicId,
              )}
              idempotencyKey={revisionIdempotencyKey}
              revision={revisionState.revision}
            />
          ) : (
            <WorkPublishedRevisionPanel
              action={seedPublishedWorkDraftAction.bind(null, parsedPublicId.data)}
              idempotencyKey={revisionIdempotencyKey}
              publishedRevisionId={revisionState.publishedRevisionId}
              publicationState={
                recoveryState.publicationState === 'published' ? 'published' : 'unpublished'
              }
            />
          )}
          {recoveryState.activityState === 'active' &&
          recoveryState.publicationState === 'published' ? (
            <WorkRemovalPanel
              cancelAction={cancelWorkRemovalRequestAction.bind(
                null,
                parsedPublicId.data,
                removalRequest?.publicId ?? removalIdempotencyKey,
              )}
              createAction={createWorkRemovalRequestAction.bind(
                null,
                parsedPublicId.data,
                recoveryState.version,
              )}
              idempotencyKey={removalIdempotencyKey}
              removalRequest={removalRequest}
              workVersion={recoveryState.version}
            />
          ) : null}
        </div>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}

async function loadChangeRequest(
  client: StudentWorksCoreClient,
  sessionToken: string,
  workPublicId: string,
) {
  try {
    return await client.getLatestChangeRequest(sessionToken, workPublicId);
  } catch (error: unknown) {
    if (error instanceof StudentWorksCoreError && error.code === 'WORK_CHANGE_REQUEST_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

function handleLoadError(error: unknown): never {
  if (
    error instanceof StudentWorksCoreError &&
    ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  ) {
    redirect('/?expired=1');
  }
  if (error instanceof StudentWorksCoreError && error.code === 'WORK_NOT_FOUND') notFound();
  if (error instanceof StudentWorksCoreError && error.code === 'FORBIDDEN') redirect('/');
  throw error;
}
