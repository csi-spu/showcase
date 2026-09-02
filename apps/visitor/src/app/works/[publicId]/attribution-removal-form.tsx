'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
    <Dialog>
      <DialogTrigger
        aria-label={labels.heading}
        className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-colors duration-150 hover:bg-black/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <TriangleAlertIcon aria-hidden="true" className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.heading}</DialogTitle>
          <DialogDescription>{labels.help}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-3">
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
          <Button
            disabled={pending || state.outcome === 'received'}
            type="submit"
            variant="outline"
          >
            {labels.submit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
