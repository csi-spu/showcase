'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { ArrowLeftIcon, GraduationCapIcon, ShieldOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionGroup } from '@/components/ui/action-group';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import type { InstructorAccountRow, InstructorRoleAction, InstructorRoleActionState } from './accounts-state';

export function GrantInstructorAction({
  accountId,
  action,
  hasInstructorRole,
  idempotencyKey,
}: {
  accountId: string;
  action: InstructorRoleAction;
  hasInstructorRole: boolean;
  idempotencyKey: string;
}) {
  const t = useTranslations('Accounts');
  const errorT = useTranslations('AccountControls');
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (previousState: InstructorRoleActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(`errors.${nextState.error}`));
        return nextState;
      }
      toast.success(t('instructorRole.grantSuccess'));
      router.refresh();
      return nextState;
    },
    { error: null, idempotencyKey, instructor: null },
  );

  if (hasInstructorRole) {
    return null;
  }

  return (
    <form action={formAction} key={state.idempotencyKey}>
      <input name="accountId" type="hidden" value={accountId} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <GrantSubmitButton label={t('instructorRole.grant')} />
    </form>
  );
}

function GrantSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <ActionTooltip label={label}>
      <Button
        aria-label={label}
        disabled={pending}
        size="icon-sm"
        title={label}
        type="submit"
        variant="ghost"
      >
        {pending ? <Spinner aria-label={label} /> : <GraduationCapIcon aria-hidden="true" />}
      </Button>
    </ActionTooltip>
  );
}

export function InstructorRowActions({
  action,
  idempotencyKey,
  instructor,
}: {
  action: InstructorRoleAction;
  idempotencyKey: string;
  instructor: InstructorAccountRow;
}) {
  const t = useTranslations('Accounts');
  const errorT = useTranslations('AccountControls');
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: InstructorRoleActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(`errors.${nextState.error}`));
        return nextState;
      }
      toast.success(t('instructorRole.revokeSuccess'));
      setIsConfirming(false);
      router.refresh();
      return nextState;
    },
    { error: null, idempotencyKey, instructor: null },
  );

  if (!isConfirming) {
    return (
      <div className="flex justify-end">
        <ActionGroup>
          <ActionTooltip label={t('instructorRole.revoke')}>
            <Button
              aria-label={t('instructorRole.revoke')}
              onClick={() => setIsConfirming(true)}
              size="icon-sm"
              title={t('instructorRole.revoke')}
              type="button"
              variant="ghost"
            >
              <ShieldOffIcon aria-hidden="true" />
            </Button>
          </ActionTooltip>
        </ActionGroup>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      aria-label={t('instructorRole.title')}
      className="ml-auto grid min-w-72 gap-3 text-left"
      key={state.idempotencyKey}
    >
      <input name="accountId" type="hidden" value={instructor.accountId} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <p className="text-sm text-muted-foreground">{t('instructorRole.revokeConfirm')}</p>
      {state.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{errorT(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <ConfirmActions
        cancelLabel={t('cancel')}
        loading={t('saving')}
        onCancel={() => setIsConfirming(false)}
        submitLabel={t('instructorRole.revoke')}
      />
    </form>
  );
}

function ConfirmActions({
  cancelLabel,
  loading,
  onCancel,
  submitLabel,
}: {
  cancelLabel: string;
  loading: string;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="flex justify-end gap-2">
      <Button disabled={pending} onClick={onCancel} type="button" variant="ghost">
        <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
        {cancelLabel}
      </Button>
      <Button disabled={pending} type="submit" variant="outline">
        {pending ? <Spinner aria-label={loading} data-icon="inline-start" /> : null}
        {pending ? loading : submitLabel}
      </Button>
    </div>
  );
}
