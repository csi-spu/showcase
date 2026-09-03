'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  KeyRoundIcon,
  PenLineIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionGroup } from '@/components/ui/action-group';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { AdminStudentAccountControls } from '@/lib/admin-account-controls-core';
import type { StudentAccountAction, StudentAccountActionState } from './account-controls-state';

/**
 * The control a row is currently collecting input for. `null` is the resting
 * state that shows the icon actions; every other value replaces them with that
 * operation's fields, because an audited mutation cannot be a bare icon click.
 */
type ActiveControl = 'extension' | 'name' | 'reset' | 'status' | null;

export function StudentRowActions({
  action,
  idempotencyKey,
  student,
}: {
  action: StudentAccountAction;
  idempotencyKey: string;
  student: AdminStudentAccountControls;
}) {
  const t = useTranslations('AccountControls');
  const accountsT = useTranslations('Accounts');
  const router = useRouter();
  const [activeControl, setActiveControl] = useState<ActiveControl>(null);
  const [state, formAction] = useActionState(
    async (previousState: StudentAccountActionState, formData: FormData) => {
      const operation = formData.get('operation');
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(t(`errors.${nextState.error}`));
        return nextState;
      }
      if (operation === 'correctName') toast.success(t('name.success'));
      else if (operation === 'extend') toast.success(t('extension.success'));
      else if (operation === 'setStatus') {
        toast.success(
          nextState.student?.status === 'suspended'
            ? accountsT('studentStatus.suspendSuccess')
            : accountsT('studentStatus.reactivateSuccess'),
        );
      }
      // A password reset keeps its control open so the one-time password stays
      // readable; every other operation returns the row to its icon actions.
      if (operation !== 'reset') setActiveControl(null);
      router.refresh();
      return nextState;
    },
    { error: null, idempotencyKey, student, temporaryPassword: null },
  );
  const current = state.student ?? student;
  const nextStatus = current.status === 'active' ? 'suspended' : 'active';

  if (activeControl === null) {
    return (
      <div className="flex justify-end">
        <ActionGroup>
          <IconAction
            label={t('name.title')}
            onClick={() => setActiveControl('name')}
            variant="ghost"
          >
            <PenLineIcon aria-hidden="true" />
          </IconAction>
          <IconAction
            label={t('extension.title')}
            onClick={() => setActiveControl('extension')}
            variant="ghost"
          >
            <CalendarPlusIcon aria-hidden="true" />
          </IconAction>
          <IconAction
            label={t('reset.submit')}
            onClick={() => setActiveControl('reset')}
            variant="ghost"
          >
            <KeyRoundIcon aria-hidden="true" />
          </IconAction>
          <IconAction
            label={
              nextStatus === 'suspended'
                ? accountsT('studentStatus.suspend')
                : accountsT('studentStatus.reactivate')
            }
            onClick={() => setActiveControl('status')}
            variant={nextStatus === 'suspended' ? 'ghost' : 'default'}
          >
            {nextStatus === 'suspended' ? (
              <ShieldOffIcon aria-hidden="true" />
            ) : (
              <ShieldCheckIcon aria-hidden="true" />
            )}
          </IconAction>
        </ActionGroup>
      </div>
    );
  }

  const fieldId = `${activeControl}-${current.accountId}`;
  return (
    <form
      action={formAction}
      aria-label={controlLabel(activeControl, t, accountsT)}
      className="ml-auto grid min-w-72 gap-3 text-left"
      key={`${activeControl}-${current.version}`}
    >
      <input name="operation" type="hidden" value={operationOf(activeControl)} />
      <input name="studentAccountId" type="hidden" value={current.accountId} />
      <input name="expectedVersion" type="hidden" value={current.version} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {activeControl === 'status' ? <input name="action" type="hidden" value={nextStatus} /> : null}

      {activeControl === 'name' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-first`}>{t('name.firstName')}</Label>
            <Input
              defaultValue={current.firstNameTh}
              id={`${fieldId}-first`}
              maxLength={100}
              name="firstNameTh"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-last`}>{t('name.lastName')}</Label>
            <Input
              defaultValue={current.lastNameTh}
              id={`${fieldId}-last`}
              maxLength={100}
              name="lastNameTh"
              required
            />
          </div>
        </div>
      ) : null}

      {activeControl === 'extension' ? (
        <div className="grid gap-2">
          <Label htmlFor={`${fieldId}-year`}>{t('extension.year')}</Label>
          <Input
            defaultValue={Math.min(current.accessEndsAcademicYear + 1, 2700)}
            id={`${fieldId}-year`}
            max={2700}
            min={current.accessEndsAcademicYear}
            name="accessEndsAcademicYear"
            required
            type="number"
          />
        </div>
      ) : null}

      {activeControl === 'reset' ? (
        <p className="text-sm text-muted-foreground">{t('reset.description')}</p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor={`${fieldId}-reason`}>{reasonLabel(activeControl, t, accountsT)}</Label>
          <Textarea
            className="min-h-24"
            id={`${fieldId}-reason`}
            maxLength={2_000}
            name="reason"
            required
          />
        </div>
      )}

      {state.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      {state.temporaryPassword === null ? null : (
        <Alert variant="success">
          <AlertTitle>{t('reset.success')}</AlertTitle>
          <AlertDescription>
            <p>{t('reset.once')}</p>
            <code className="mt-3 block select-all rounded-control border border-success/30 bg-card p-3 text-base text-foreground">
              {state.temporaryPassword}
            </code>
          </AlertDescription>
        </Alert>
      )}

      <ConfirmActions
        cancelLabel={accountsT('cancel')}
        loading={t('saving')}
        onCancel={() => setActiveControl(null)}
        submitLabel={submitLabel(activeControl, nextStatus, t, accountsT)}
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

function IconAction({
  children,
  label,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  variant: 'default' | 'ghost';
}) {
  return (
    <ActionTooltip label={label}>
      <Button
        aria-label={label}
        onClick={onClick}
        size="icon-sm"
        title={label}
        type="button"
        variant={variant}
      >
        {children}
      </Button>
    </ActionTooltip>
  );
}

function operationOf(control: Exclude<ActiveControl, null>): string {
  if (control === 'name') return 'correctName';
  if (control === 'extension') return 'extend';
  if (control === 'status') return 'setStatus';
  return 'reset';
}

function controlLabel(
  control: Exclude<ActiveControl, null>,
  t: (key: string) => string,
  accountsT: (key: string) => string,
): string {
  if (control === 'name') return t('name.title');
  if (control === 'extension') return t('extension.title');
  if (control === 'status') return accountsT('studentStatus.title');
  return t('reset.submit');
}

function reasonLabel(
  control: Exclude<ActiveControl, null>,
  t: (key: string) => string,
  accountsT: (key: string) => string,
): string {
  if (control === 'name') return t('name.reason');
  if (control === 'extension') return t('extension.reason');
  return accountsT('studentStatus.reason');
}

function submitLabel(
  control: Exclude<ActiveControl, null>,
  nextStatus: 'active' | 'suspended',
  t: (key: string) => string,
  accountsT: (key: string) => string,
): string {
  if (control === 'name') return t('name.submit');
  if (control === 'extension') return t('extension.submit');
  if (control === 'reset') return t('reset.confirm');
  return nextStatus === 'suspended'
    ? accountsT('studentStatus.suspend')
    : accountsT('studentStatus.reactivate');
}
