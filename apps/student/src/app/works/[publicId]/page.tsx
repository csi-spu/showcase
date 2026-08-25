import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient, StudentWorksCoreError } from '@/lib/student-works-core';
import { WorkForm } from '../work-form';
import { WorkRevisionPendingPanel, WorkRevisionSubmissionPanel } from '../work-revision-panel';
import {
  submitWorkRevisionAction,
  updateWorkAction,
  withdrawWorkRevisionAction,
} from '../work.actions';
import { ContributorInvitationsPanel } from './contributor-invitations-panel';

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
    | {
        context: Awaited<ReturnType<StudentWorksCoreClient['getAuthoringContext']>>;
        invitations: Awaited<ReturnType<StudentWorksCoreClient['listWorkInvitations']>>;
        kind: 'draft';
        work: Awaited<ReturnType<StudentWorksCoreClient['getWork']>>;
      }
    | {
        kind: 'pending';
        revision: NonNullable<Awaited<ReturnType<StudentWorksCoreClient['getPendingRevision']>>>;
      };
  try {
    const pendingRevision = await client.getPendingRevision(sessionToken, parsedPublicId.data);
    if (pendingRevision !== null) {
      revisionState = { kind: 'pending', revision: pendingRevision };
    } else {
      const [context, work, invitations] = await Promise.all([
        client.getAuthoringContext(sessionToken),
        client.getWork(sessionToken, parsedPublicId.data),
        client.listWorkInvitations(sessionToken, parsedPublicId.data),
      ]);
      revisionState = { context, invitations, kind: 'draft', work };
    }
  } catch (error: unknown) {
    handleLoadError(error);
  }
  const [t, draftIdempotencyKey, revisionIdempotencyKey] = await Promise.all([
    getTranslations('WorkPage'),
    Promise.resolve(randomUUID()),
    Promise.resolve(randomUUID()),
  ]);
  const updateAction = updateWorkAction.bind(null, parsedPublicId.data);

  return (
    <main className="mx-auto min-h-svh w-full max-w-[1440px] bg-background">
      <header className="border-b border-border px-[clamp(1rem,4vw,3rem)] py-6">
        <nav aria-label={t('navigation')} className="flex items-center justify-between gap-4">
          <Link className="font-semibold tracking-[0.12em]" href="/">
            STUDENT SHOWCASE
          </Link>
          <Link className="text-sm font-medium text-primary underline" href="/">
            {t('back')}
          </Link>
        </nav>
      </header>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-10 lg:grid-cols-12 lg:py-16">
        <header className="grid content-start gap-4 lg:col-span-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">
            {revisionState.kind === 'draft' ? 'PRIVATE DRAFT' : 'PENDING REVIEW'}
          </p>
          <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
            {revisionState.kind === 'draft' ? t('editHeading') : t('pendingHeading')}
          </h1>
          <p className="text-muted-foreground">
            {revisionState.kind === 'draft' ? t('editDescription') : t('pendingDescription')}
          </p>
          <p className="text-sm text-muted-foreground">
            {revisionState.kind === 'draft'
              ? t('version', { version: revisionState.work.version })
              : t('revision', { number: revisionState.revision.number })}
          </p>
        </header>
        <div className="lg:col-span-8">
          {revisionState.kind === 'draft' ? (
            <>
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
              <WorkRevisionSubmissionPanel
                action={submitWorkRevisionAction.bind(null, parsedPublicId.data)}
                basePublishedRevisionId={revisionState.work.basePublishedRevisionId}
                draftVersion={revisionState.work.version}
                idempotencyKey={revisionIdempotencyKey}
              />
            </>
          ) : (
            <WorkRevisionPendingPanel
              action={withdrawWorkRevisionAction.bind(
                null,
                parsedPublicId.data,
                revisionState.revision.publicId,
              )}
              idempotencyKey={revisionIdempotencyKey}
              revision={revisionState.revision}
            />
          )}
        </div>
      </div>
    </main>
  );
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
