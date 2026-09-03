'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { PenLineIcon, ShieldOffIcon, ShieldCheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import type { AdminAccountControls } from '@/lib/admin-account-controls-core';
import type { SetAdminStatusAction, SetAdminStatusActionState } from './accounts-state';

export function AdminRowSheet({
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
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: SetAdminStatusActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(`errors.${nextState.error}`));
      } else {
        toast.success(
          nextState.admin?.status === 'suspended'
            ? t('adminStatus.suspendSuccess')
            : t('adminStatus.reactivateSuccess'),
        );
        router.refresh();
      }
      return nextState;
    },
    { admin: null, error: null, idempotencyKey },
  );
  const current = state.admin ?? {
    accountId: admin.accountId,
    createdAt: admin.createdAt,
    firstNameTh: admin.firstNameTh,
    lastNameTh: admin.lastNameTh,
    status: admin.status,
    version: admin.version,
  };
  const nextAction = current.status === 'active' ? 'suspended' : 'active';

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        <PenLineIcon aria-hidden="true" data-icon="inline-start" />
        {t('manage')}
      </SheetTrigger>
      <SheetContent closeLabel={t('close')}>
        <SheetHeader>
          <SheetTitle>{`${current.firstNameTh} ${current.lastNameTh}`}</SheetTitle>
          <SheetDescription>{t('adminStatus.description')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          <StatusBadge tone={current.status === 'active' ? 'success' : 'warning'}>
            {t(`status.${current.status}`)}
          </StatusBadge>
          {state.error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription>{errorT(`errors.${state.error}`)}</AlertDescription>
            </Alert>
          )}
          <form action={formAction} className="flex flex-col gap-4" key={current.version}>
            <input name="accountId" type="hidden" value={current.accountId} />
            <input name="action" type="hidden" value={nextAction} />
            <input name="expectedVersion" type="hidden" value={current.version} />
            <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
            <Field>
              <FieldLabel htmlFor="admin-status-reason">{t('adminStatus.reason')}</FieldLabel>
              <Textarea
                className="min-h-28"
                id="admin-status-reason"
                maxLength={2_000}
                name="reason"
                required
              />
              <FieldDescription>{t('adminStatus.reasonHelp')}</FieldDescription>
            </Field>
            <SubmitButton
              icon={nextAction === 'suspended' ? 'suspend' : 'reactivate'}
              label={
                nextAction === 'suspended' ? t('adminStatus.suspend') : t('adminStatus.reactivate')
              }
              loading={t('saving')}
            />
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SubmitButton({
  icon,
  label,
  loading,
}: {
  icon: 'reactivate' | 'suspend';
  label: string;
  loading: string;
}) {
  const { pending } = useFormStatus();
  const Icon = icon === 'suspend' ? ShieldOffIcon : ShieldCheckIcon;
  return (
    <Button disabled={pending} type="submit" variant={icon === 'suspend' ? 'outline' : 'default'}>
      {pending ? (
        <Spinner aria-label={loading} data-icon="inline-start" />
      ) : (
        <Icon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? loading : label}
    </Button>
  );
}
