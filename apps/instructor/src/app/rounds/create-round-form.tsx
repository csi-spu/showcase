'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { CreateRoundAction, CreateRoundActionState } from '../collection-groups-state';
import { INITIAL_CREATE_ROUND_STATE } from '../collection-groups-state';

export function CreateRoundForm({ action }: { action: CreateRoundAction }) {
  const t = useTranslations('Groups');
  const errorT = useTranslations('Groups.errors');
  const [, formAction] = useActionState(
    async (previousState: CreateRoundActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) toast.error(errorT(nextState.error));
      return nextState;
    },
    INITIAL_CREATE_ROUND_STATE,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field className="min-w-64 flex-1">
        <FieldLabel htmlFor="round-name">{t('round.name')}</FieldLabel>
        <Input id="round-name" maxLength={200} name="name" required />
      </Field>
      <SubmitButton label={t('round.create')} pendingLabel={t('saving')} />
    </form>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <Spinner aria-label={pendingLabel} data-icon="inline-start" />
      ) : (
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}
