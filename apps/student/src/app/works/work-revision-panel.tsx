'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { WorkChangeRequest, WorkRevision } from '@/lib/student-works-core';
import {
  initialWorkRevisionActionState,
  type WorkRevisionActionState,
} from './work-revision-action-state';

type RevisionAction = (
  previousState: WorkRevisionActionState,
  formData: FormData,
) => Promise<WorkRevisionActionState>;

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

export function WorkRevisionSubmissionPanel({
  action,
  basePublishedRevisionId,
  draftVersion,
  idempotencyKey,
}: {
  action: RevisionAction;
  basePublishedRevisionId: string | null;
  draftVersion: number;
  idempotencyKey: string;
}) {
  const t = useTranslations('WorkRevision');
  const [state, formAction] = useActionState(
    action,
    initialWorkRevisionActionState(idempotencyKey),
  );
  return (
    <section className="mt-8 grid gap-6 rounded-surface border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-2">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">SUBMIT FOR REVIEW</p>
        <h2 className="text-2xl font-semibold">{t('submitHeading')}</h2>
        <p className="text-muted-foreground">{t('submitHelp')}</p>
      </div>
      <form action={formAction} className="grid gap-6">
        <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
        <input name="expectedDraftVersion" type="hidden" value={draftVersion} />
        <input
          name="expectedBasePublishedRevisionId"
          type="hidden"
          value={basePublishedRevisionId ?? ''}
        />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="revision-attribution-name">{t('attributionName')}</FieldLabel>
            <Input id="revision-attribution-name" maxLength={100} name="attributionName" required />
            <FieldDescription>{t('attributionHelp')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="revision-study-year">{t('studyYear')}</FieldLabel>
            <Input
              id="revision-study-year"
              max={8}
              min={1}
              name="studyYear"
              required
              type="number"
            />
          </Field>
        </FieldGroup>
        <RevisionFeedback state={state} />
        <SubmitButton label={t('submit')} pendingLabel={t('submitting')} />
      </form>
    </section>
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
  const [state, formAction] = useActionState(
    action,
    initialWorkRevisionActionState(idempotencyKey),
  );
  return (
    <section className="grid gap-6 rounded-surface border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-2">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">
          REVISION {revision.number}
        </p>
        <h2 className="text-2xl font-semibold">{t('pendingHeading')}</h2>
        <p className="text-muted-foreground">{t('pendingHelp')}</p>
      </div>
      <Alert>
        <AlertTitle>{t('pendingStatus')}</AlertTitle>
        <AlertDescription>Revision {revision.number}</AlertDescription>
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
