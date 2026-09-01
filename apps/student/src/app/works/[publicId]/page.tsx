import { randomUUID } from 'node:crypto';
import { ArchiveIcon } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import {
  StudentWorksCoreClient,
  StudentWorksCoreError,
  type WorkRevision,
} from '@/lib/student-works-core';
import { StudentWorkspaceShell } from '../../student-workspace-shell';
import { WorkspacePage } from '../../workspace-page';
import { WorkForm } from '../work-form';
import { WorkRevisionDetails } from '../work-revision-details';
import {
  WorkChangeRequestPanel,
  WorkPublishedRevisionPanel,
  WorkRevisionPendingPanel,
} from '../work-revision-panel';
import { seedPublishedWorkDraftAction, withdrawWorkRevisionAction } from '../work.actions';

export default async function EditWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const parsed = z.uuid().safeParse((await params).publicId);
  if (!parsed.success) notFound();
  const initialStep = parseInitialStep((await searchParams).step);
  const auth = await getStudentAuthPageState();
  if (auth.kind !== 'active') redirect('/?expired=1');
  const token = await readStudentSessionToken();
  if (token === null) redirect('/?expired=1');
  const environment = getStudentServerEnvironment();
  const client = new StudentWorksCoreClient(environment);
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(client, token, parsed.data);
  } catch (error: unknown) {
    handleLoadError(error);
  }
  const [t, tRevision, tWork] = await Promise.all([
    getTranslations('WorkPage'),
    getTranslations('WorkRevision'),
    getTranslations('Work'),
  ]);
  const canMutate = auth.session.canUseStudentCapabilities;
  const title =
    state.kind === 'draft'
      ? (state.work.draft.title ?? t('editHeading'))
      : state.kind === 'pending' || state.kind === 'published'
        ? state.revision.content.title
        : t('archivedHeading');
  const description =
    state.kind === 'draft'
      ? (state.work.draft.summary ?? t('editDescription'))
      : state.kind === 'pending' || state.kind === 'published'
        ? state.revision.content.summary
        : t('archivedDescription');

  return (
    <StudentWorkspaceShell activePage="works">
      <WorkspacePage
        description={description}
        eyebrow={
          state.kind === 'draft'
            ? t('draftEyebrow')
            : state.kind === 'pending'
              ? t('pendingEyebrow')
              : state.kind === 'published'
                ? t(
                    state.publicationState === 'published'
                      ? 'publishedEyebrow'
                      : 'unpublishedEyebrow',
                  )
                : t('archivedEyebrow')
        }
        layout="authoring"
        meta={
          state.kind === 'draft'
            ? t('savedAt', { value: formatBangkokDate(state.work.savedAt) })
            : state.kind === 'pending' || state.kind === 'published'
              ? [
                  t('revision', { number: state.revision.number }),
                  t('submittedAt', { value: formatBangkokDate(state.revision.submittedAt) }),
                ].join(' · ')
              : t('recoveryVersion', { version: state.version })
        }
        title={title}
      >
        <div className="grid gap-6">
          {!canMutate ? (
            <Alert>
              <AlertTitle>{t('readOnlyHeading')}</AlertTitle>
              <AlertDescription>{t('readOnly')}</AlertDescription>
            </Alert>
          ) : null}
          {state.kind === 'draft' ? (
            canMutate ? (
              <>
                {state.changeRequest === null ? null : (
                  <WorkChangeRequestPanel review={state.changeRequest} />
                )}
                <WorkForm
                  context={state.context}
                  initialStep={initialStep}
                  initialWork={state.work}
                />
              </>
            ) : null
          ) : state.kind === 'pending' ? (
            <WorkRevisionDetails
              action={
                canMutate ? (
                  <WorkRevisionPendingPanel
                    action={withdrawWorkRevisionAction.bind(
                      null,
                      parsed.data,
                      state.revision.publicId,
                    )}
                    idempotencyKey={randomUUID()}
                    revision={state.revision}
                  />
                ) : undefined
              }
              labels={revisionDetailsLabels(state.revision, tRevision, tWork)}
              revision={state.revision}
            />
          ) : state.kind === 'published' ? (
            <WorkRevisionDetails
              action={
                canMutate ? (
                  <WorkPublishedRevisionPanel
                    action={seedPublishedWorkDraftAction.bind(null, parsed.data)}
                    idempotencyKey={randomUUID()}
                    publicationState={state.publicationState}
                    {...(state.publicationState === 'published'
                      ? { publicHref: `${environment.visitorUrl}/works/${parsed.data}` }
                      : {})}
                    publishedRevisionId={state.publishedRevisionId}
                  />
                ) : undefined
              }
              labels={revisionDetailsLabels(state.revision, tRevision, tWork)}
              revision={state.revision}
            />
          ) : (
            <Card className="mx-auto w-full max-w-4xl">
              <CardHeader className="border-b">
                <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                  <ArchiveIcon aria-hidden="true" className="size-5" />
                </div>
                <CardTitle>
                  <h2>{t('archivedHeading')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="max-w-[62ch] leading-7 text-muted-foreground">{t('archivedHelp')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}

function parseInitialStep(value: string | string[] | undefined): number {
  const parsed = z.enum(['1', '2', '3', '4', '5']).safeParse(value);
  return parsed.success ? Number(parsed.data) - 1 : 0;
}

async function loadState(client: StudentWorksCoreClient, token: string, publicId: string) {
  const recovery = await client.getRecoveryState(token, publicId);
  if (recovery.activityState === 'archived')
    return { kind: 'archived' as const, version: recovery.version };
  const pending = await client.getPendingRevision(token, publicId);
  if (pending !== null) return { kind: 'pending' as const, revision: pending };
  const authoring = await client.getAuthoringState(token, publicId);
  if (authoring.draft !== null)
    return {
      context: await client.getAuthoringContext(token),
      changeRequest: await readLatestChangeRequest(client, token, publicId),
      kind: 'draft' as const,
      work: authoring.draft,
    };
  if (authoring.publishedRevisionId === null) throw new Error('WORK_AUTHORING_STATE_INVARIANT');
  const revision = await client.getPublishedRevision(token, publicId);
  if (revision === null) throw new Error('WORK_PUBLISHED_REVISION_INVARIANT');
  return {
    kind: 'published' as const,
    publicationState:
      recovery.publicationState === 'published' ? ('published' as const) : ('unpublished' as const),
    publishedRevisionId: authoring.publishedRevisionId,
    revision,
  };
}

async function readLatestChangeRequest(
  client: StudentWorksCoreClient,
  token: string,
  publicId: string,
) {
  try {
    return await client.getLatestChangeRequest(token, publicId);
  } catch (error: unknown) {
    if (error instanceof StudentWorksCoreError && error.code === 'WORK_CHANGE_REQUEST_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

function revisionDetailsLabels(
  revision: WorkRevision,
  tRevision: Awaited<ReturnType<typeof getTranslations>>,
  tWork: Awaited<ReturnType<typeof getTranslations>>,
) {
  return {
    academicPeriod: tRevision('details.academicPeriodValue', {
      semester:
        revision.content.academicPeriod.semester === 'summer'
          ? tWork('summer')
          : revision.content.academicPeriod.semester,
      year: revision.content.academicPeriod.year,
    }),
    academicPeriodLabel: tRevision('details.academicPeriod'),
    attributions: tRevision('details.attributions'),
    category: tWork(`categories.${revision.content.category}`),
    categoryLabel: tRevision('details.category'),
    description: tRevision('details.description'),
    discovery: tRevision('details.discovery'),
    galleryAlt: (index: number) => tRevision('details.galleryAlt', { index }),
    information: tRevision('details.information'),
    links: tRevision('details.links'),
    media: tRevision('details.media'),
    mediaHelp: tRevision('details.mediaHelp'),
    posterAlt: tRevision('details.posterAlt', { title: revision.content.title }),
    revision: tRevision('details.revisionValue', { number: revision.number }),
    revisionLabel: tRevision('details.revision'),
    studyYear: (year: number) => tRevision('details.studyYear', { year }),
    submittedAt: formatBangkokDate(revision.submittedAt),
    submittedAtLabel: tRevision('details.submittedAt'),
    submitter: tRevision('details.submitter'),
    tags: tRevision('details.tags'),
    videos: tRevision('details.videos'),
  };
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
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
