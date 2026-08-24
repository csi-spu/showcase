'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { AuthAction, AuthErrorMessage } from './student-auth-action-state';
import { INITIAL_AUTH_ACTION_STATE } from './student-auth-action-state';

export function LoginForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useActionState(action, INITIAL_AUTH_ACTION_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <FieldSet aria-label="ข้อมูลเข้าสู่ระบบ">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="student-id">{t('login.studentId')}</FieldLabel>
            <Input
              autoComplete="username"
              id="student-id"
              inputMode="numeric"
              maxLength={8}
              name="studentId"
              pattern="[0-9]{8}"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t('login.password')}</FieldLabel>
            <Input
              autoComplete="current-password"
              id="password"
              maxLength={128}
              name="password"
              required
              type="password"
            />
          </Field>
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton label={t('login.submit')} pendingLabel={t('submitting')} />
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useActionState(action, INITIAL_AUTH_ACTION_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <FieldSet aria-label="ตั้งรหัสผ่านใหม่">
        <FieldGroup>
          <PasswordField
            autoComplete="current-password"
            id="current-password"
            label={t('change.currentPassword')}
            name="currentPassword"
          />
          <PasswordField
            autoComplete="new-password"
            id="new-password"
            label={t('change.newPassword')}
            name="newPassword"
          />
          <PasswordField
            autoComplete="new-password"
            id="confirm-password"
            label={t('change.confirmPassword')}
            name="confirmPassword"
          />
          <FieldDescription>{t('change.requirements')}</FieldDescription>
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton label={t('change.submit')} pendingLabel={t('submitting')} />
    </form>
  );
}

export function LogoutForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useActionState(action, INITIAL_AUTH_ACTION_STATE);

  return (
    <form action={formAction} className="w-full space-y-3">
      <ActionError error={state.error} />
      <SubmitButton label={t('active.logout')} pendingLabel={t('submitting')} variant="outline" />
    </form>
  );
}

function PasswordField({
  autoComplete,
  id,
  label,
  name,
}: {
  autoComplete: 'current-password' | 'new-password';
  id: string;
  label: string;
  name: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        autoComplete={autoComplete}
        id={id}
        maxLength={128}
        minLength={name === 'currentPassword' ? undefined : 12}
        name={name}
        required
        type="password"
      />
    </Field>
  );
}

function ActionError({ error }: { error: AuthErrorMessage | null }) {
  const t = useTranslations('Auth.errors');
  return error === null ? null : (
    <Alert variant="destructive">
      <AlertDescription>{t(error)}</AlertDescription>
    </Alert>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'default',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'default' | 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending} size="lg" type="submit" variant={variant}>
      {pending ? <Spinner aria-label={pendingLabel} /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
