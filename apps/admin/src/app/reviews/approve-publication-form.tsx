'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface ApprovePublicationActionState {
  error: 'invalid' | 'network' | 'stale' | 'unavailable' | null;
  idempotencyKey: string;
  publication: { publishedAt: string; workPublicId: string } | null;
}

export type ApprovePublicationAction = (
  previousState: ApprovePublicationActionState,
  formData: FormData,
) => Promise<ApprovePublicationActionState>;

export function ApprovePublicationForm({
  action,
  expectedRevisionVersion,
  idempotencyKey,
}: {
  action: ApprovePublicationAction;
  expectedRevisionVersion: number;
  idempotencyKey: string;
}) {
  const t = useTranslations('Review');
  const [state, formAction] = useActionState(action, {
    error: null,
    idempotencyKey,
    publication: null,
  });
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error !== null) errorRef.current?.focus();
  }, [state.error]);

  if (state.publication !== null) {
    return (
      <Alert className="border-success/30 bg-success-background text-success">
        <AlertTitle>{t('approval.success')}</AlertTitle>
        <AlertDescription>
          {t('approval.successHelp')} <code>/works/{state.publication.workPublicId}</code>
          <Link
            className="mt-3 block font-medium underline"
            href={`/corrections/${state.publication.workPublicId}`}
          >
            {t('approval.createCorrection')}
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input name="expectedRevisionVersion" type="hidden" value={expectedRevisionVersion} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <p className="text-sm leading-6 text-muted-foreground">{t('approval.warning')}</p>
      {state.error === null ? null : (
        <Alert ref={errorRef} role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>{t('approval.errorHeading')}</AlertTitle>
          <AlertDescription>{t(`approval.errors.${state.error}`)}</AlertDescription>
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
      {pending ? t('approval.submitting') : t('approval.submit')}
    </Button>
  );
}
