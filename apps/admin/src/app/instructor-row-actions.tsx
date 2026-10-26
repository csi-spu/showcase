'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { ArrowLeftIcon, GraduationCapIcon, KeyRoundIcon, ShieldOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionGroup } from '@/components/ui/action-group';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import type {
  InstructorAccountRow,
  InstructorPasswordResetAction,
  InstructorPasswordResetActionState,
  InstructorRoleAction,
  InstructorRoleActionState,
} from './accounts-state';

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

/**
 * The control a row is currently collecting confirmation for. `null` shows the
 * icon actions; a password reset keeps its control open after success so the
 * one-time password stays readable.
 */
type ActiveControl = 'reset' | 'revoke' | null;

export function InstructorRowActions({
  action,
  idempotencyKey,
  instructor,
  resetAction,
  resetIdempotencyKey,
}: {
  action: InstructorRoleAction;
  idempotencyKey: string;
  instructor: InstructorAccountRow;
  resetAction: InstructorPasswordResetAction;
  resetIdempotencyKey: string;
}) {
  const t = useTranslations('Accounts');
  const controlsT = useTranslations('AccountControls');
  const router = useRouter();
  const [activeControl, setActiveControl] = useState<ActiveControl>(null);
  const [state, formAction] = useActionState(
    async (previousState: InstructorRoleActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(controlsT(`errors.${nextState.error}`));
        return nextState;
      }
      toast.success(t('instructorRole.revokeSuccess'));
      setActiveControl(null);
      router.refresh();
      return nextState;
    },
    { error: null, idempotencyKey, instructor: null },
  );
  const [resetState, resetFormAction] = useActionState(
    async (previousState: InstructorPasswordResetActionState, formData: FormData) => {
      const nextState = await resetAction(previousState, formData);
      if (nextState.error !== null) {
        toast.error(controlsT(`errors.${nextState.error}`));
        return nextState;
      }
      toast.success(controlsT('reset.success'));
      router.refresh();
      return nextState;
    },
    { error: null, idempotencyKey: resetIdempotencyKey, instructor, temporaryPassword: null },
  );
  const current = resetState.instructor ?? instructor;

  if (activeControl === null) {
    return (
      <div className="flex justify-end">
        <ActionGroup>
          {current.hasAdminRole ? null : (
            <IconAction label={controlsT('reset.submit')} onClick={() => setActiveControl('reset')}>
              <KeyRoundIcon aria-hidden="true" />
            </IconAction>
          )}
          <IconAction label={t('instructorRole.revoke')} onClick={() => setActiveControl('revoke')}>
            <ShieldOffIcon aria-hidden="true" />
          </IconAction>
        </ActionGroup>
      </div>
    );
  }

  if (activeControl === 'reset') {
    return (
      <form
        action={resetFormAction}
        aria-label={controlsT('reset.submit')}
        className="ml-auto grid min-w-72 gap-3 text-left"
        key={`reset-${current.version}`}
      >
        <input name="accountId" type="hidden" value={current.accountId} />
        <input name="expectedVersion" type="hidden" value={current.version} />
        <input name="idempotencyKey" type="hidden" value={resetState.idempotencyKey} />
        <p className="text-sm text-muted-foreground">{controlsT('reset.description')}</p>
        {resetState.error === null ? null : (
          <Alert variant="destructive">
            <AlertDescription>{controlsT(`errors.${resetState.error}`)}</AlertDescription>
          </Alert>
        )}
        {resetState.temporaryPassword === null ? null : (
          <Alert variant="success">
            <AlertTitle>{controlsT('reset.success')}</AlertTitle>
            <AlertDescription>
              <p>{controlsT('reset.once')}</p>
              <code className="mt-3 block select-all rounded-control border border-success/30 bg-card p-3 text-base text-foreground">
                {resetState.temporaryPassword}
              </code>
            </AlertDescription>
          </Alert>
        )}
        <ConfirmActions
          cancelLabel={t('cancel')}
          loading={controlsT('reset.loading')}
          onCancel={() => setActiveControl(null)}
          submitLabel={controlsT('reset.confirm')}
        />
      </form>
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
          <AlertDescription>{controlsT(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <ConfirmActions
        cancelLabel={t('cancel')}
        loading={t('saving')}
        onCancel={() => setActiveControl(null)}
        submitLabel={t('instructorRole.revoke')}
      />
    </form>
  );
}

function IconAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <ActionTooltip label={label}>
      <Button
        aria-label={label}
        onClick={onClick}
        size="icon-sm"
        title={label}
        type="button"
        variant="ghost"
      >
        {children}
      </Button>
    </ActionTooltip>
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
