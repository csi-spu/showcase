'use client';

import { Button } from '@/components/ui/button';
import { useActionState } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { AttributionRemovalActionState } from './attribution-removal.actions';

export function AttributionRemovalForm({
  action,
  idempotencyKey,
  labels,
}: {
  action: (
    state: AttributionRemovalActionState,
    data: FormData,
  ) => Promise<AttributionRemovalActionState>;
  idempotencyKey: string;
  labels: Record<
    | 'heading'
    | 'help'
    | 'invalid'
    | 'rateLimited'
    | 'reason'
    | 'received'
    | 'submit'
    | 'unavailable',
    string
  >;
}) {
  const initialState: AttributionRemovalActionState = { outcome: 'idle' };
  const [state, formAction, pending] = useActionState(action, initialState);
  const message =
    state.outcome === 'idle'
      ? null
      : state.outcome === 'rate_limited'
        ? labels.rateLimited
        : state.outcome === 'invalid'
          ? labels.invalid
          : state.outcome === 'received'
            ? labels.received
            : labels.unavailable;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
        {labels.heading}
      </summary>
      <form action={formAction} className="mt-3 grid gap-3">
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <Field>
          <FieldLabel>{labels.reason}</FieldLabel>
          <Textarea
            disabled={state.outcome === 'received'}
            maxLength={1_000}
            minLength={10}
            name="reason"
            required
          />
          <FieldDescription>{labels.help}</FieldDescription>
        </Field>
        {message === null ? null : (
          <p aria-live="polite" className="text-sm">
            {message}
          </p>
        )}
        <Button disabled={pending || state.outcome === 'received'} type="submit" variant="outline">
          {labels.submit}
        </Button>
      </form>
    </details>
  );
}
