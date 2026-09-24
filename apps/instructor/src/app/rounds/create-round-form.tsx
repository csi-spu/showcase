'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { CreateRoundAction, CreateRoundActionState } from '../collection-groups-state';
import { INITIAL_CREATE_ROUND_STATE } from '../collection-groups-state';

export function CreateRoundPanel({ action }: { action: CreateRoundAction }) {
  const t = useTranslations('Groups');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {t('round.create')}
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>{t('round.createTitle')}</DialogTitle>
        <DialogDescription>{t('round.createDescription')}</DialogDescription>
        <CreateRoundForm action={action} onCreated={() => setIsOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateRoundForm({
  action,
  onCreated,
}: {
  action: CreateRoundAction;
  onCreated: () => void;
}) {
  const t = useTranslations('Groups');
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  const [, formAction] = useActionState(
    async (previousState: CreateRoundActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
      } else {
        toast.success(t('round.createSuccess'));
        onCreated();
        router.refresh();
      }
      return nextState;
    },
    INITIAL_CREATE_ROUND_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="round-name">{t('round.name')}</FieldLabel>
        <Input id="round-name" maxLength={200} name="name" required />
      </Field>
      <DialogFooter>
        <DialogClose
          render={
            <Button type="button" variant="outline">
              {t('round.createClose')}
            </Button>
          }
        />
        <SubmitButton label={t('round.create')} pendingLabel={t('saving')} />
      </DialogFooter>
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
