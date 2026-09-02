'use client';

import { Button, buttonVariants } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { ExternalLinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { WorkChangeRequest, WorkRevision } from '@/lib/student-works-core';
import {
  initialWorkRevisionActionState,
  type WorkRevisionActionState,
} from './work-revision-action-state';

type RevisionAction = (
  previousState: WorkRevisionActionState,
  formData: FormData,
) => Promise<WorkRevisionActionState>;

function useRevisionActionWithToast(
  action: RevisionAction,
  idempotencyKey: string,
  successMessage: string,
  tone: 'success' | 'warning' = 'success',
) {
  const t = useTranslations('WorkRevision');
  return useActionState(async (previousState: WorkRevisionActionState, formData: FormData) => {
    const nextState = await action(previousState, formData);
    if (nextState.error !== null) toast.error(t(`errors.${nextState.error}`));
    else if (nextState.success) {
      if (tone === 'success') toast.success(successMessage);
      else toast.warning(successMessage);
    }
    return nextState;
  }, initialWorkRevisionActionState(idempotencyKey));
}

export function WorkChangeRequestPanel({ review }: { review: WorkChangeRequest }) {
  const t = useTranslations('WorkRevision');
  return (
    <Alert className="mb-8 border-warning/30 bg-warning-background text-warning">
      <AlertTitle>
        {t('changeRequest.heading', { reason: t(`reasons.${review.reason}`) })}
      </AlertTitle>
      <AlertDescription>
        <p className="whitespace-pre-wrap text-foreground">{review.feedback}</p>
        <p className="mt-3 text-sm text-warning">
          {t('changeRequest.revision', { number: review.revisionNumber })}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function WorkRevisionPendingPanel({
  action,
  idempotencyKey,
  revision,
}: {
  action: RevisionAction;
  idempotencyKey: string;
  revision: WorkRevision;
}) {
  const t = useTranslations('WorkRevision');
  const [state, formAction] = useRevisionActionWithToast(
    action,
    idempotencyKey,
    t('withdrawnSuccess'),
  );
  return (
    <section className="grid gap-5 rounded-surface border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-2">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          {t('pendingEyebrow', { number: revision.number })}
        </p>
        <h2 className="text-xl font-semibold">{t('pendingHeading')}</h2>
        <p className="text-muted-foreground">{t('pendingHelp')}</p>
      </div>
      <Alert className="border-warning/30 bg-warning-background text-warning">
        <AlertTitle>{t('pendingStatus')}</AlertTitle>
        <AlertDescription>{t('pendingRevision', { number: revision.number })}</AlertDescription>
      </Alert>
      <form action={formAction} className="grid gap-4">
        <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
        <input name="expectedRevisionVersion" type="hidden" value={revision.version} />
        <RevisionFeedback state={state} />
        <SubmitButton label={t('withdraw')} pendingLabel={t('withdrawing')} variant="outline" />
      </form>
    </section>
  );
}

export function WorkPublishedRevisionPanel({
  action,
  idempotencyKey,
  publicHref,
  publishedRevisionId,
  publicationState = 'published',
}: {
  action: RevisionAction;
  idempotencyKey: string;
  publicHref?: string;
  publishedRevisionId: string;
  publicationState?: 'published' | 'unpublished';
}) {
  const t = useTranslations('WorkRevision');
  const [state, formAction] = useRevisionActionWithToast(
    action,
    idempotencyKey,
    t('published.createdSuccess'),
  );
  return (
    <section className="grid gap-5 rounded-surface border border-information/30 bg-information-background p-5 shadow-sm">
      <div className="grid gap-2">
        <p className="text-xs font-semibold tracking-[0.14em] text-information uppercase">
          {t(publicationState === 'published' ? 'published.eyebrow' : 'unpublished.eyebrow')}
        </p>
        <h2 className="text-xl font-semibold">
          {t(publicationState === 'published' ? 'published.heading' : 'unpublished.heading')}
        </h2>
        <p className="text-muted-foreground">
          {t(publicationState === 'published' ? 'published.help' : 'unpublished.help')}
        </p>
      </div>
      <form action={formAction} className="grid gap-4">
        <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
        <input name="expectedPublishedRevisionId" type="hidden" value={publishedRevisionId} />
        <RevisionFeedback state={state} />
        <SubmitButton label={t('published.create')} pendingLabel={t('published.creating')} />
      </form>
      {publicHref === undefined ? null : (
        <a
          className={buttonVariants({ className: 'w-full', variant: 'outline' })}
          href={publicHref}
          rel="noreferrer"
          target="_blank"
        >
          {t('published.viewPublic')}
          <ExternalLinkIcon aria-hidden="true" data-icon="inline-end" />
        </a>
      )}
    </section>
  );
}

export function WorkRevisionRebasePanel({
  action,
  draftVersion,
  idempotencyKey,
  publishedRevisionId,
}: {
  action: RevisionAction;
  draftVersion: number;
  idempotencyKey: string;
  publishedRevisionId: string;
}) {
  const t = useTranslations('WorkRevision');
  const [state, formAction] = useRevisionActionWithToast(
    action,
    idempotencyKey,
    t('rebase.success'),
    'warning',
  );
  return (
    <Alert className="mb-8 border-warning/30 bg-warning-background text-warning">
      <AlertTitle>{t('rebase.heading')}</AlertTitle>
      <AlertDescription>
        <p className="text-foreground">{t('rebase.help')}</p>
        <form action={formAction} className="mt-5 grid gap-4">
          <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
          <input name="expectedVersion" type="hidden" value={draftVersion} />
          <input name="expectedPublishedRevisionId" type="hidden" value={publishedRevisionId} />
          <RevisionFeedback state={state} />
          <SubmitButton
            label={t('rebase.submit')}
            pendingLabel={t('rebase.submitting')}
            variant="outline"
          />
        </form>
      </AlertDescription>
    </Alert>
  );
}

function RevisionFeedback({ state }: { state: WorkRevisionActionState }) {
  const t = useTranslations('WorkRevision');
  if (state.error === null) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{t('errorHeading')}</AlertTitle>
      <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
    </Alert>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'default',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'default' | 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 w-full sm:w-fit" disabled={pending} type="submit" variant={variant}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
