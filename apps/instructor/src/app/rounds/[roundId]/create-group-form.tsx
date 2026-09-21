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
import type { CreateGroupAction, CreateGroupActionState } from '../../collection-groups-state';
import { INITIAL_CREATE_GROUP_STATE } from '../../collection-groups-state';

export function CreateGroupForm({ action }: { action: CreateGroupAction }) {
  const t = useTranslations('Groups');
  const errorT = useTranslations('Groups.errors');
  const [, formAction] = useActionState(
    async (previousState: CreateGroupActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) toast.error(errorT(nextState.error));
      return nextState;
    },
    INITIAL_CREATE_GROUP_STATE,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field className="min-w-64 flex-1">
        <FieldLabel htmlFor="group-name">{t('group.name')}</FieldLabel>
        <Input id="group-name" maxLength={200} name="name" required />
      </Field>
      <SubmitButton label={t('group.create')} pendingLabel={t('saving')} />
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
