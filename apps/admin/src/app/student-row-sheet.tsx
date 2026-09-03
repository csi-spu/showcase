'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { CheckCircle2Icon, KeyRoundIcon, PenLineIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import type { AdminStudentAccountControls } from '@/lib/admin-account-controls-core';
import type { StudentAccountAction, StudentAccountActionState } from './account-controls-state';

export function StudentRowSheet({
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
  const [open, setOpen] = useState(false);
  const [activeControl, setActiveControl] = useState<'extension' | 'name' | 'reset' | null>(null);
  const [state, formAction] = useActionState(
    async (previousState: StudentAccountActionState, formData: FormData) => {
      const operation = formData.get('operation');
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(t(`errors.${nextState.error}`));
      } else {
        if (operation === 'correctName') toast.success(t('name.success'));
        else if (operation === 'extend') toast.success(t('extension.success'));
        router.refresh();
      }
      return nextState;
    },
    { error: null, idempotencyKey, student, temporaryPassword: null },
  );
  const current = state.student ?? student;

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        <PenLineIcon aria-hidden="true" data-icon="inline-start" />
        {accountsT('manage')}
      </SheetTrigger>
      <SheetContent closeLabel={accountsT('close')}>
        <SheetHeader>
          <SheetTitle>{`${current.firstNameTh} ${current.lastNameTh}`}</SheetTitle>
          <SheetDescription>{t('student.entryYear', { year: current.entryYear })}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          <StatusBadge tone="warning">{t(`student.state.${current.state}`)}</StatusBadge>
          {state.error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
            </Alert>
          )}
          {state.temporaryPassword === null ? null : (
            <Alert variant="success">
              <CheckCircle2Icon aria-hidden="true" />
              <AlertTitle>{t('reset.success')}</AlertTitle>
              <AlertDescription>
                <p>{t('reset.once')}</p>
                <code className="mt-3 block select-all rounded-control border border-success/30 bg-card p-3 text-base text-foreground">
                  {state.temporaryPassword}
                </code>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Button onClick={() => setActiveControl('name')} type="button" variant="outline">
              {t('name.title')}
            </Button>
            <Button onClick={() => setActiveControl('extension')} type="button" variant="outline">
              {t('extension.title')}
            </Button>
            <Button onClick={() => setActiveControl('reset')} type="button" variant="outline">
              <KeyRoundIcon aria-hidden="true" data-icon="inline-start" />
              {t('reset.submit')}
            </Button>
          </div>
          {activeControl === 'name' ? (
            <FieldSet aria-label={t('name.title')}>
              <form
                action={formAction}
                className="flex flex-col gap-4 rounded-surface border border-border p-4"
                key={current.version}
              >
                <input name="operation" type="hidden" value="correctName" />
                <MutationFields
                  idempotencyKey={state.idempotencyKey}
                  studentAccountId={current.accountId}
                  version={current.version}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="row-student-first-name">{t('name.firstName')}</FieldLabel>
                    <Input
                      defaultValue={current.firstNameTh}
                      id="row-student-first-name"
                      maxLength={100}
                      name="firstNameTh"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="row-student-last-name">{t('name.lastName')}</FieldLabel>
                    <Input
                      defaultValue={current.lastNameTh}
                      id="row-student-last-name"
                      maxLength={100}
                      name="lastNameTh"
                      required
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="row-student-name-reason">{t('name.reason')}</FieldLabel>
                  <Textarea
                    className="min-h-28"
                    id="row-student-name-reason"
                    maxLength={2_000}
                    name="reason"
                    required
                  />
                  <FieldDescription>{t('name.reasonHelp')}</FieldDescription>
                </Field>
                <SubmitButton label={t('name.submit')} loading={t('saving')} />
              </form>
            </FieldSet>
          ) : null}
          {activeControl === 'extension' ? (
            <FieldSet aria-label={t('extension.title')}>
              <form
                action={formAction}
                className="flex flex-col gap-4 rounded-surface border border-border p-4"
                key={current.version}
              >
                <input name="operation" type="hidden" value="extend" />
                <MutationFields
                  idempotencyKey={state.idempotencyKey}
                  studentAccountId={current.accountId}
                  version={current.version}
                />
                <Field>
                  <FieldLabel htmlFor="row-access-ends-academic-year">
                    {t('extension.year')}
                  </FieldLabel>
                  <Input
                    defaultValue={Math.min(current.accessEndsAcademicYear + 1, 2700)}
                    id="row-access-ends-academic-year"
                    max={2700}
                    min={current.accessEndsAcademicYear}
                    name="accessEndsAcademicYear"
                    required
                    type="number"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="row-access-extension-reason">
                    {t('extension.reason')}
                  </FieldLabel>
                  <Textarea
                    className="min-h-28"
                    id="row-access-extension-reason"
                    maxLength={2_000}
                    name="reason"
                    required
                  />
                  <FieldDescription>{t('extension.reasonHelp')}</FieldDescription>
                </Field>
                <SubmitButton label={t('extension.submit')} loading={t('saving')} />
              </form>
            </FieldSet>
          ) : null}
          {activeControl === 'reset' ? (
            <form
              action={formAction}
              className="flex flex-col gap-3 rounded-surface border border-warning/30 bg-warning-background p-4"
              key={current.version}
            >
              <input name="operation" type="hidden" value="reset" />
              <MutationFields
                idempotencyKey={state.idempotencyKey}
                studentAccountId={current.accountId}
                version={current.version}
              />
              <p className="text-sm text-muted-foreground">{t('reset.description')}</p>
              <SubmitButton
                icon="key"
                label={t('reset.confirm')}
                loading={t('reset.loading')}
                variant="outline"
              />
            </form>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MutationFields({
  idempotencyKey,
  studentAccountId,
  version,
}: {
  idempotencyKey: string;
  studentAccountId: string;
  version: number;
}) {
  return (
    <>
      <input name="studentAccountId" type="hidden" value={studentAccountId} />
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    </>
  );
}

function SubmitButton({
  icon,
  label,
  loading,
  variant,
}: {
  icon?: 'key';
  label: string;
  loading: string;
  variant?: 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant={variant}>
      {pending ? (
        <Spinner aria-label={loading} data-icon="inline-start" />
      ) : icon === 'key' ? (
        <KeyRoundIcon aria-hidden="true" data-icon="inline-start" />
      ) : null}
      {pending ? loading : label}
    </Button>
  );
}
