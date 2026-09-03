'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { CheckCircle2Icon, UserPlusIcon } from 'lucide-react';
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
import type { CreateAdminAction, CreateAdminActionState } from './accounts-state';

export function AddAdminSheet({
  action,
  idempotencyKey,
}: {
  action: CreateAdminAction;
  idempotencyKey: string;
}) {
  const t = useTranslations('Accounts');
  const errorT = useTranslations('AccountControls');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: CreateAdminActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(`errors.${nextState.error}`));
      } else {
        router.refresh();
      }
      return nextState;
    },
    { admin: null, error: null, idempotencyKey, temporaryPassword: null },
  );

  return (
    <Sheet
      onOpenChange={(next) => {
        setOpen(next);
      }}
      open={open}
    >
      <SheetTrigger render={<Button size="lg" variant="outline" />}>
        <UserPlusIcon aria-hidden="true" data-icon="inline-start" />
        {t('addAdmin.trigger')}
      </SheetTrigger>
      <SheetContent closeLabel={t('close')}>
        <SheetHeader>
          <SheetTitle>{t('addAdmin.title')}</SheetTitle>
          <SheetDescription>{t('addAdmin.description')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          {state.temporaryPassword === null ? (
            <form action={formAction} className="flex flex-col gap-5" key={state.idempotencyKey}>
              <FieldSet aria-label={t('addAdmin.title')}>
                <Field>
                  <FieldLabel htmlFor="add-admin-login">{t('addAdmin.adminLogin')}</FieldLabel>
                  <Input
                    autoComplete="off"
                    id="add-admin-login"
                    maxLength={64}
                    minLength={3}
                    name="adminLogin"
                    required
                  />
                  <FieldDescription>{t('addAdmin.adminLoginHelp')}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="add-admin-first-name">{t('addAdmin.firstName')}</FieldLabel>
                  <Input id="add-admin-first-name" maxLength={100} name="firstNameTh" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="add-admin-last-name">{t('addAdmin.lastName')}</FieldLabel>
                  <Input id="add-admin-last-name" maxLength={100} name="lastNameTh" required />
                </Field>
              </FieldSet>
              {state.error === null ? null : (
                <Alert variant="destructive">
                  <AlertDescription>{errorT(`errors.${state.error}`)}</AlertDescription>
                </Alert>
              )}
              <SubmitButton label={t('addAdmin.submit')} loading={t('saving')} />
            </form>
          ) : (
            <Alert variant="success">
              <CheckCircle2Icon aria-hidden="true" />
              <AlertTitle>
                {t('addAdmin.success', { adminLogin: state.admin?.adminLogin ?? '' })}
              </AlertTitle>
              <AlertDescription>
                <p>{t('addAdmin.passwordOnce')}</p>
                <code className="mt-3 block select-all rounded-control border border-success/30 bg-card p-3 text-base text-foreground">
                  {state.temporaryPassword}
                </code>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SubmitButton({ label, loading }: { label: string; loading: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="lg" type="submit">
      {pending ? <Spinner aria-label={loading} data-icon="inline-start" /> : null}
      {pending ? loading : label}
    </Button>
  );
}
