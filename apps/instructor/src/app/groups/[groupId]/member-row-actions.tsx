'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { ArrowLeftIcon, UserMinusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@showcase/ui/textarea';
import type { WithdrawMemberAction, WithdrawMemberActionState } from '../../collection-groups-state';
import { INITIAL_WITHDRAW_STATE } from '../../collection-groups-state';

export function MemberRowActions({
  action,
  studentAccountId,
}: {
  action: WithdrawMemberAction;
  studentAccountId: string;
}) {
  const t = useTranslations('Groups.members');
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, formAction] = useActionState(async (
    previousState: WithdrawMemberActionState,
    formData: FormData,
  ) => {
    const nextState = await action(previousState, formData);
    if (nextState.error !== null) {
      toast.error(errorT(nextState.error));
      return nextState;
    }
    toast.success(t('withdrawSuccess'));
    setIsConfirming(false);
    router.refresh();
    return nextState;
  }, INITIAL_WITHDRAW_STATE);

  if (!isConfirming) {
    return (
      <Button onClick={() => setIsConfirming(true)} size="sm" type="button" variant="ghost">
        <UserMinusIcon aria-hidden="true" data-icon="inline-start" />
        {t('withdraw')}
      </Button>
    );
  }

  return (
    <form action={formAction} className="grid min-w-72 gap-2 text-left">
      <input name="studentAccountId" type="hidden" value={studentAccountId} />
      <Label htmlFor={`withdraw-reason-${studentAccountId}`}>{t('withdrawReason')}</Label>
      <Textarea id={`withdraw-reason-${studentAccountId}`} maxLength={2_000} name="reason" required />
      {state.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{errorT(state.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={() => setIsConfirming(false)} size="sm" type="button" variant="ghost">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t('cancel')}
        </Button>
        <SubmitButton label={t('withdraw')} />
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="sm" type="submit" variant="outline">
      {pending ? <Spinner aria-label={label} data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}
