'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { Textarea } from '@showcase/ui/textarea';
import { UserMinusIcon, UserPlusIcon } from 'lucide-react';
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
  ReinstateMemberAction,
} from '../../collection-groups-state';
import { INITIAL_WITHDRAW_STATE } from '../../collection-groups-state';

export function MemberRowActions({
  action,
  kind,
  memberName,
  studentAccountId,
}: {
  action: WithdrawMemberAction | ReinstateMemberAction;
  kind: 'withdraw' | 'reinstate';
  memberName: string;
  studentAccountId: string;
}) {
  const t = useTranslations('Groups.members');
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  const reasonId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const isReinstating = kind === 'reinstate';
  const Icon = isReinstating ? UserPlusIcon : UserMinusIcon;
  const label = isReinstating ? t('reinstate') : t('withdraw');
  const [state, formAction] = useActionState(
    async (previousState: WithdrawMemberActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      toast.success(isReinstating ? t('reinstateSuccess') : t('withdrawSuccess'));
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
            <Icon aria-hidden="true" data-icon="inline-start" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">
              {isReinstating
                ? t('reinstateMember', { name: memberName })
                : t('withdrawMember', { name: memberName })}
            </span>
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>
          {isReinstating ? t('reinstateTitle') : t('withdrawTitle')}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {isReinstating
            ? t('reinstateConfirm', { name: memberName })
            : t('withdrawConfirm', { name: memberName })}
        </AlertDialogDescription>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="studentAccountId" type="hidden" value={studentAccountId} />
          <Field>
            <FieldLabel htmlFor={reasonId}>
              {isReinstating ? t('reinstateReason') : t('withdrawReason')}
            </FieldLabel>
            <Textarea id={reasonId} maxLength={2_000} name="reason" required rows={3} />
            <FieldDescription>
              {isReinstating ? t('reinstateReasonHelp') : t('withdrawReasonHelp')}
            </FieldDescription>
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
            <SubmitButton
              icon={Icon}
              label={label}
              pendingLabel={isReinstating ? t('reinstating') : t('withdrawing')}
              variant={isReinstating ? 'default' : 'destructive'}
            />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SubmitButton({
  icon: Icon,
  label,
  pendingLabel,
  variant,
}: {
  icon: typeof UserMinusIcon;
  label: string;
  pendingLabel: string;
  variant: 'default' | 'destructive';
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant={variant}>
      {pending ? (
        <Spinner aria-label={pendingLabel} data-icon="inline-start" />
      ) : (
        <Icon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}
