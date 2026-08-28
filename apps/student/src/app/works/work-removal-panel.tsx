'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { RemovalRequest } from '@/lib/student-works-core';
import { initialWorkRemovalActionState, type WorkRemovalActionState } from './work-removal-state';

type RemovalAction = (
  previousState: WorkRemovalActionState,
  formData: FormData,
) => Promise<WorkRemovalActionState>;

export function WorkRemovalPanel({
  cancelAction,
  createAction,
  idempotencyKey,
  removalRequest,
  workVersion,
}: {
  cancelAction: RemovalAction;
  createAction: RemovalAction;
  idempotencyKey: string;
  removalRequest: RemovalRequest | null;
  workVersion: number;
}) {
  const t = useTranslations('WorkRemoval');
  const action = removalRequest === null ? createAction : cancelAction;
  const [state, formAction, pending] = useActionState(
    action,
    initialWorkRemovalActionState(idempotencyKey),
  );

  return (
    <section className="mt-8 grid gap-6 rounded-surface border border-warning/30 bg-warning-background p-6 sm:p-8">
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-warning">คำขอที่ยกเลิกได้</p>
        <h2 className="text-2xl font-semibold">{t('heading')}</h2>
        <p className="text-muted-foreground">{t('help')}</p>
      </div>
      {removalRequest === null ? (
        <form action={formAction} className="grid gap-4">
          <input name="expectedWorkVersion" type="hidden" value={workVersion} />
          <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
          <div className="grid gap-2">
            <Label htmlFor="work-removal-reason">{t('reason')}</Label>
            <Textarea
              className="min-h-32 bg-background leading-7"
              id="work-removal-reason"
              maxLength={1_000}
              minLength={10}
              name="reason"
              required
            />
          </div>
          <Feedback state={state} />
          <Button
            className="min-h-11 w-full sm:w-fit"
            disabled={pending}
            type="submit"
            variant="outline"
          >
            {pending ? t('submitting') : t('submit')}
          </Button>
        </form>
      ) : (
        <Alert className="border-information/30 bg-information-background">
          <AlertTitle>{t('pending')}</AlertTitle>
          <AlertDescription>
            <p className="whitespace-pre-wrap text-foreground">{removalRequest.reason}</p>
            <form action={formAction} className="mt-5 grid gap-4">
              <input name="expectedVersion" type="hidden" value={removalRequest.version} />
              <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
              <Feedback state={state} />
              <Button
                className="min-h-11 w-full sm:w-fit"
                disabled={pending}
                type="submit"
                variant="outline"
              >
                {pending ? t('cancelling') : t('cancel')}
              </Button>
            </form>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function Feedback({ state }: { state: WorkRemovalActionState }) {
  const t = useTranslations('WorkRemoval');
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {state.success ? t('saved') : state.error === null ? '' : t(`errors.${state.error}`)}
    </p>
  );
}
