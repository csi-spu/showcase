'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
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
  const [state, formAction, pending] = useActionState(action, INITIAL_ROSTER_CONFLICT_STATE);
  const [isAcceptingIncoming, setIsAcceptingIncoming] = useState(false);
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
      {isAcceptingIncoming ? (
        <Field>
          <FieldLabel htmlFor={`conflict-reason-${conflictId}`}>{t('reasonLabel')}</FieldLabel>
          <Textarea
            className="min-h-28"
            id={`conflict-reason-${conflictId}`}
            maxLength={2000}
            name="reason"
            required
          />
          <FieldDescription>{t('reasonHelp')}</FieldDescription>
        </Field>
      ) : null}
      {state.error === null ? null : (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {isAcceptingIncoming ? (
          <>
            <Button
              disabled={pending}
              onClick={() => setIsAcceptingIncoming(false)}
              type="button"
              variant="ghost"
            >
              {t('cancelIncoming')}
            </Button>
            <Button disabled={pending} name="resolution" type="submit" value="accept_incoming_name">
              {pending ? t('saving') : t('confirmIncoming')}
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={pending}
              name="resolution"
              type="submit"
              value="keep_existing"
              variant="outline"
            >
              {pending ? t('saving') : t('keepExisting')}
            </Button>
            <Button disabled={pending} onClick={() => setIsAcceptingIncoming(true)} type="button">
              {t('acceptIncoming')}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
