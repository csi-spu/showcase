'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { ArrowLeftIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionGroup } from '@/components/ui/action-group';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { AdminAccountControls } from '@/lib/admin-account-controls-core';
import type { SetAdminStatusAction, SetAdminStatusActionState } from './accounts-state';

export function AdminRowActions({
  action,
  admin,
  idempotencyKey,
}: {
  action: SetAdminStatusAction;
  admin: AdminAccountControls;
  idempotencyKey: string;
}) {
  const t = useTranslations('Accounts');
  const errorT = useTranslations('AccountControls');
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: SetAdminStatusActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(`errors.${nextState.error}`));
        return nextState;
      }
      toast.success(
        nextState.admin?.status === 'suspended'
          ? t('adminStatus.suspendSuccess')
          : t('adminStatus.reactivateSuccess'),
      );
      setIsConfirming(false);
      router.refresh();
      return nextState;
    },
    { admin: null, error: null, idempotencyKey },
  );
  const current = state.admin ?? admin;
  const nextAction = current.status === 'active' ? 'suspended' : 'active';
  const label = nextAction === 'suspended' ? t('adminStatus.suspend') : t('adminStatus.reactivate');
  const Icon = nextAction === 'suspended' ? ShieldOffIcon : ShieldCheckIcon;

  if (!isConfirming) {
    return (
      <div className="flex justify-end">
        <ActionGroup>
          <ActionTooltip label={label}>
            <Button
              aria-label={label}
              onClick={() => setIsConfirming(true)}
              size="icon-sm"
              title={label}
              type="button"
              variant={nextAction === 'suspended' ? 'ghost' : 'default'}
            >
              <Icon aria-hidden="true" />
            </Button>
          </ActionTooltip>
        </ActionGroup>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      aria-label={t('adminStatus.title')}
      className="ml-auto grid min-w-72 gap-3 text-left"
      key={current.version}
    >
      <input name="accountId" type="hidden" value={current.accountId} />
      <input name="action" type="hidden" value={nextAction} />
      <input name="expectedVersion" type="hidden" value={current.version} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <div className="grid gap-2">
        <Label htmlFor={`admin-status-reason-${current.accountId}`}>
          {t('adminStatus.reason')}
        </Label>
        <Textarea
          className="min-h-24"
          id={`admin-status-reason-${current.accountId}`}
          maxLength={2_000}
          name="reason"
          required
        />
      </div>
      {state.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{errorT(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <ConfirmActions
        cancelLabel={t('cancel')}
        loading={t('saving')}
        onCancel={() => setIsConfirming(false)}
        submitLabel={label}
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
