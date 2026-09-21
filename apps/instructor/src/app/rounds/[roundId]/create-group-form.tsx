'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { DisclosurePanel } from '@/components/ui/disclosure-panel';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { CreateGroupAction, CreateGroupActionState } from '../../collection-groups-state';
import { INITIAL_CREATE_GROUP_STATE } from '../../collection-groups-state';

export function CreateGroupPanel({ action }: { action: CreateGroupAction }) {
  const t = useTranslations('Groups');

  return (
    <DisclosurePanel
      closeLabel={t('group.createClose')}
      openLabel={t('group.create')}
      title={t('group.createTitle')}
    >
      <CreateGroupForm action={action} />
    </DisclosurePanel>
  );
}

function CreateGroupForm({ action }: { action: CreateGroupAction }) {
  const t = useTranslations('Groups');
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  const [, formAction] = useActionState(
    async (previousState: CreateGroupActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
      } else {
        toast.success(t('group.createSuccess'));
        router.refresh();
      }
      return nextState;
    },
    INITIAL_CREATE_GROUP_STATE,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field className="min-w-64 flex-1">
        <FieldLabel htmlFor="group-name">{t('group.name')}</FieldLabel>
        <Input id="group-name" maxLength={200} name="name" required />
        <FieldDescription>{t('group.createDescription')}</FieldDescription>
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
