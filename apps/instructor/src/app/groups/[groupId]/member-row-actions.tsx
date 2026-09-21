'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { Textarea } from '@showcase/ui/textarea';
import { UserMinusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import type {
  WithdrawMemberAction,
  WithdrawMemberActionState,
} from '../../collection-groups-state';
import { INITIAL_WITHDRAW_STATE } from '../../collection-groups-state';

export function MemberRowActions({
  action,
  memberName,
  studentAccountId,
}: {
  action: WithdrawMemberAction;
  memberName: string;
  studentAccountId: string;
}) {
  const t = useTranslations('Groups.members');
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  const reasonId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: WithdrawMemberActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      toast.success(t('withdrawSuccess'));
      setIsOpen(false);
      router.refresh();
      return nextState;
    },
    INITIAL_WITHDRAW_STATE,
  );

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="ghost">
            <UserMinusIcon aria-hidden="true" data-icon="inline-start" />
            <span className="hidden sm:inline">{t('withdraw')}</span>
            <span className="sr-only sm:hidden">{t('withdrawMember', { name: memberName })}</span>
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{t('withdrawTitle')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('withdrawConfirm', { name: memberName })}
        </AlertDialogDescription>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="studentAccountId" type="hidden" value={studentAccountId} />
          <Field>
            <FieldLabel htmlFor={reasonId}>{t('withdrawReason')}</FieldLabel>
            <Textarea id={reasonId} maxLength={2_000} name="reason" required rows={3} />
            <FieldDescription>{t('withdrawReasonHelp')}</FieldDescription>
          </Field>
          {state.error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button onClick={() => setIsOpen(false)} type="button" variant="ghost">
              {t('cancel')}
            </Button>
            <SubmitButton label={t('withdraw')} pendingLabel={t('withdrawing')} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="destructive">
      {pending ? (
        <Spinner aria-label={pendingLabel} data-icon="inline-start" />
      ) : (
        <UserMinusIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}
