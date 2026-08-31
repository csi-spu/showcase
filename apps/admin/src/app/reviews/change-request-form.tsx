'use client';

import { Button } from '@showcase/ui/button';
import { CheckCircle2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

export type ChangeRequestActionError = 'invalid' | 'network' | 'stale' | 'unavailable' | null;

export interface ChangeRequestActionState {
  error: ChangeRequestActionError;
  idempotencyKey: string;
  isComplete: boolean;
}

export type ChangeRequestAction = (
  previousState: ChangeRequestActionState,
  formData: FormData,
) => Promise<ChangeRequestActionState>;

export function ChangeRequestForm({
  action,
  expectedRevisionVersion,
  idempotencyKey,
}: {
  action: ChangeRequestAction;
  expectedRevisionVersion: number;
  idempotencyKey: string;
}) {
  const t = useTranslations('Review');
  const [state, formAction] = useActionState(action, {
    error: null,
    idempotencyKey,
    isComplete: false,
  });
  const [feedback, setFeedback] = useState('');
  const [reason, setReason] = useState('content');
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error !== null) errorRef.current?.focus();
  }, [state.error]);

  if (state.isComplete) {
    return (
      <Alert variant="success">
        <CheckCircle2Icon aria-hidden="true" />
        <AlertTitle>{t('form.success')}</AlertTitle>
        <AlertDescription>{t('form.successHelp')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input name="expectedRevisionVersion" type="hidden" value={expectedRevisionVersion} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <Field>
        <FieldLabel htmlFor="change-request-reason">{t('form.reason')}</FieldLabel>
        <select
          className="min-h-11 rounded-control border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
          id="change-request-reason"
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        >
          {(['content', 'attribution', 'media', 'links_tags', 'policy', 'other'] as const).map(
            (reason) => (
              <option key={reason} value={reason}>
                {t(`reasons.${reason}`)}
              </option>
            ),
          )}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor="change-request-feedback">{t('form.feedback')}</FieldLabel>
        <Textarea
          className="min-h-40"
          id="change-request-feedback"
          maxLength={2_000}
          minLength={10}
          name="feedback"
          onChange={(event) => setFeedback(event.target.value)}
          required
          value={feedback}
        />
        <FieldDescription>{t('form.feedbackHelp')}</FieldDescription>
      </Field>
      {state.error === null ? null : (
        <Alert ref={errorRef} role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>{t('form.errorHeading')}</AlertTitle>
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const t = useTranslations('Review');
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 w-full sm:w-fit" disabled={pending} type="submit">
      {pending ? t('form.submitting') : t('form.submit')}
    </Button>
  );
}
