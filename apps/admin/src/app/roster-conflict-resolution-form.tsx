'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import type { RosterConflictAction } from './roster-conflict-state';
import { INITIAL_ROSTER_CONFLICT_STATE } from './roster-conflict-state';

export function RosterConflictResolutionForm({
  action,
  batchId,
  conflictId,
  expectedVersion,
  idempotencyKey,
}: {
  action: RosterConflictAction;
  batchId: string;
  conflictId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  const t = useTranslations('Roster.conflicts');
  const [state, formAction] = useActionState(action, INITIAL_ROSTER_CONFLICT_STATE);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error !== null) errorRef.current?.focus();
  }, [state.error]);
  return (
    <form action={formAction} className="flex flex-col gap-4 border-t border-border pt-4">
      <input name="batchId" type="hidden" value={batchId} />
      <input name="conflictId" type="hidden" value={conflictId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <Field>
        <FieldLabel htmlFor={`conflict-reason-${conflictId}`}>{t('reasonLabel')}</FieldLabel>
        <textarea
          className="min-h-28 rounded-control border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
          id={`conflict-reason-${conflictId}`}
          maxLength={2000}
          name="reason"
        />
        <FieldDescription>{t('reasonHelp')}</FieldDescription>
      </Field>
      {state.error === null ? null : (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <ResolutionButtons />
    </form>
  );
}

function ResolutionButtons() {
  const t = useTranslations('Roster.conflicts');
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button
        disabled={pending}
        name="resolution"
        type="submit"
        value="keep_existing"
        variant="outline"
      >
        {t('keepExisting')}
      </Button>
      <Button disabled={pending} name="resolution" type="submit" value="accept_incoming_name">
        {pending ? t('saving') : t('acceptIncoming')}
      </Button>
    </div>
  );
}
